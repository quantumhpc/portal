/**
 * Browser remote-desktop sessions.
 *
 * The job writes `<job>.web` (host, port, one-time VNC password) next to its
 * `.vnc` file. The portal reads it as the user, creates a random token, routes
 * the token to host:port for websockify, and gives token + password only to the
 * job's owner. A reverse proxy asks authorizeToken() before every WebSocket.
 */

import crypto from 'crypto';
import { getConfig } from '@/lib/config';
import { getDb } from '@/lib/db/connection';
import { getJobInfo } from '@/lib/db/jobs';
import { asUser, type FsUser } from '@/lib/files/as-user';
import { isTerminal } from '@/lib/hpc/status';
import { tokenExists, writeToken } from './tokens';

export interface VncConnection {
  host: string;
  port: number;
  password: string;
}

export type VncSession =
  | { ready: true; url: string; password: string }
  | { ready: false; reason: string };

/** Parse the key=value `.web` file written by apps/templates/remote/vnc/connect.sh. */
export function parseConnection(text: string): VncConnection {
  const kv = Object.fromEntries(
    text.split('\n').map((l) => l.trim()).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  const port = Number(kv.port);
  if (!kv.host || !Number.isInteger(port) || !kv.password) throw new Error('Incomplete VNC connection file');
  return { host: kv.host, port, password: kv.password };
}

/** The session's WebSocket URL: vnc_websocket_url plus ?token=… */
function wsUrl(token: string): string {
  const base = String(getConfig().mainConfig.vnc_websocket_url || '/vnc-ws');
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

const webFileOf = (connectionFile: string) => connectionFile.replace(/\.[^./]+$/, '') + '.web';

/** Set up (or return) the browser session of one of `user`'s remote jobs. */
export async function getVncSession(user: { _id: { toString(): string }; system: FsUser }, jobId: string): Promise<VncSession | null> {
  const [job] = await getJobInfo(user._id.toString(), jobId);
  if (!job || job.jobInfo?.jobArgs?.type !== 'remote') return null;

  const status = job.server?.status;
  if (isTerminal(status)) return { ready: false, reason: 'The session has ended.' };

  const existing = job.jobInfo.vnc;
  if (existing?.token && tokenExists(job.jobId)) {
    return { ready: true, url: wsUrl(existing.token), password: existing.password };
  }

  const connectionFile = job.jobInfo.jobArgs.connectionFile;
  if (!connectionFile) return { ready: false, reason: 'This job has no connection file.' };

  let conn: VncConnection;
  try {
    const read = asUser(user.system, 'read', webFileOf(connectionFile), 'utf8', 4096);
    conn = parseConnection(read.data ?? '');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ready: false, reason: status === 'Running' ? 'The desktop is starting…' : 'Waiting for the job to start…' };
    }
    throw err;
  }

  const token = crypto.randomBytes(32).toString('base64url');
  writeToken(job.jobId, token, conn.host, conn.port);
  const db = await getDb();
  await db.collection('jobs').updateOne(
    { jobId: job.jobId, 'jobInfo.userId': user._id.toString() },
    { $set: { 'jobInfo.vnc': { token, password: conn.password, host: conn.host, port: conn.port, created: new Date() } } }
  );
  return { ready: true, url: wsUrl(token), password: conn.password };
}

/** True when `token` belongs to a live session of `userId`. */
export async function authorizeToken(userId: string, token: string): Promise<boolean> {
  if (!token || token.length > 128) return false;
  const db = await getDb();
  const job = await db.collection('jobs').findOne({ 'jobInfo.userId': userId, 'jobInfo.vnc.token': token });
  return !!job && !isTerminal(job.server?.status) && tokenExists(job.jobId);
}
