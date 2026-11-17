/**
 * Resumable uploads (tus protocol, https://tus.io).
 *
 * Partial uploads are written by the portal (root) into a root-owned 0711
 * directory under tmpdir. When an upload completes, the file is handed to the
 * user and placed at its destination by a process running as the user, so the
 * kernel decides whether the user may write there.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Server, type Upload } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { getConfig } from '@/lib/config';
import type { AuthenticatedUser } from '@/lib/db/models/user';
import { asUser } from './as-user';
import { getUploadFolder } from './datajs';
import { log } from '@/lib/log';

export const TUS_PATH = '/api/data/tus';
const EXPIRY_MS = 24 * 60 * 60 * 1000;

/** The authenticated user of the request being handled (set by the route). */
export const currentUser = new AsyncLocalStorage<AuthenticatedUser>();

const fail = (status_code: number, body: string) => Object.assign(new Error(body), { status_code, body });

function requireUser(): AuthenticatedUser {
  const user = currentUser.getStore();
  if (!user) throw fail(401, 'Unauthorized');
  return user;
}

/**
 * Final path of an upload; the name is reduced to its basename so it can't climb out.
 * Without a destination (job input files) the file goes to a fresh folder inside the
 * user's upload folder, so an abandoned upload never blocks the same name later.
 */
export function uploadTarget(user: AuthenticatedUser, metadata: Upload['metadata']): string {
  const name = path.basename(metadata?.filename || metadata?.name || '');
  if (!name || name === '.' || name === '..') throw fail(400, 'Missing file name');
  if (!metadata?.destination) {
    const dir = path.join(getUploadFolder(user), randomUUID());
    asUser(user.system, 'mkdir', dir);
    return path.join(dir, name);
  }
  if (!path.isAbsolute(metadata.destination)) throw fail(400, 'Destination must be an absolute path');
  return path.join(metadata.destination, name);
}

function checkTarget(user: AuthenticatedUser, target: string): void {
  if (!asUser(user.system, 'access', path.dirname(target), fs.constants.W_OK)) {
    throw fail(403, 'You do not have write permission on the destination folder');
  }
  if (asUser(user.system, 'access', target, fs.constants.F_OK)) {
    throw fail(409, `${path.basename(target)} already exists in the destination folder`);
  }
}

let server: { tus: Server; store: FileStore } | null = null;

function createServer() {
  const { tmpdir, upload_max_size_gb } = getConfig().mainConfig;
  const directory = path.join(tmpdir, '.partials', 'tus');
  fs.mkdirSync(directory, { recursive: true });
  // 0711: users can open their own finished upload by name, but nobody can list the folder.
  fs.chmodSync(path.dirname(directory), 0o711);
  fs.chmodSync(directory, 0o711);

  const store = new FileStore({ directory, expirationPeriodInMilliseconds: EXPIRY_MS });

  const tus = new Server({
    path: TUS_PATH,
    datastore: store,
    relativeLocation: true,
    exposedHeaders: ['Upload-Target'],
    maxSize: Number(upload_max_size_gb) * 1024 ** 3,

    // Every request on an existing upload: only its owner may touch it.
    async onIncomingRequest(_req, id) {
      const user = requireUser();
      if (!id) return;
      let upload: Upload;
      try {
        upload = await store.getUpload(id);
      } catch {
        return; // unknown id: tus answers 404 itself
      }
      if (upload.metadata?.owner !== user._id.toString()) throw fail(404, 'Upload not found');
    },

    async onUploadCreate(_req, upload) {
      const user = requireUser();
      const target = uploadTarget(user, upload.metadata);
      checkTarget(user, target); // fail now rather than after a 50 GB transfer
      return { metadata: { ...upload.metadata, owner: user._id.toString(), target } };
    },

    async onUploadFinish(_req, upload) {
      const user = requireUser();
      const partial = path.join(directory, upload.id);
      const target = upload.metadata?.target;
      if (!target) throw fail(400, 'Upload has no target');
      try {
        // Root-owned file in a root-owned folder: safe to hand over before the user reads it.
        fs.chownSync(partial, user.system.uid, user.system.gid);
        fs.chmodSync(partial, 0o600);
        asUser(user.system, 'place', partial, target);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') throw fail(409, `${path.basename(target)} already exists in the destination folder`);
        if (code === 'EACCES' || code === 'EPERM') throw fail(403, 'You do not have write permission on the destination folder');
        throw err;
      } finally {
        await store.remove(upload.id).catch(() => {});
      }
      // Lets the client learn where the file landed (job submission needs the path).
      return { headers: { 'Upload-Target': target } };
    },
  });

  // Drop abandoned partial uploads now and every hour.
  const sweep = () => tus.cleanUpExpiredUploads()
    .then((n) => { if (n) log.info({ n }, 'removed expired uploads'); })
    .catch((err) => log.error({ err }, 'upload cleanup failed'));
  void sweep();
  setInterval(sweep, 60 * 60 * 1000).unref();

  return { tus, store };
}

export function getTusServer(): Server {
  server ??= createServer();
  return server.tus;
}
