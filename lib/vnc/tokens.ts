/**
 * websockify token files: one file per session, "<token>: <host>:<port>",
 * read by websockify's TokenFile plugin (`--token-plugin TokenFile
 * --token-source <dir>`). Written by the portal (root) into a folder users
 * cannot write, so nobody can point a token at a host of their choice.
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from '@/lib/config';
import { log } from '@/lib/log';

export function tokenDir(): string {
  const { vnc_token_dir, tmpdir } = getConfig().mainConfig;
  return vnc_token_dir ? path.resolve(vnc_token_dir) : path.join(tmpdir, 'vnc-tokens');
}

let swept = false;

function ensureDir(): string {
  const dir = tokenDir();
  // 0750: websockify reads it through the group (see docs/remote-desktop.md).
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  if (!swept) {
    swept = true;
    sweepTokens();
    setInterval(sweepTokens, 60 * 60 * 1000).unref();
  }
  return dir;
}

const fileFor = (jobId: string) => path.join(tokenDir(), String(jobId).replace(/[^A-Za-z0-9._-]/g, '_'));

const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,252})$/;

/** Route `token` to host:port. Validates both, since they come from a user-written file. */
export function writeToken(jobId: string, token: string, host: string, port: number): void {
  if (!HOST.test(host)) throw new Error(`Invalid VNC host: ${host}`);
  if (!Number.isInteger(port) || port < 5900 || port > 65535) throw new Error(`Invalid VNC port: ${port}`);
  ensureDir();
  const file = fileFor(jobId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${token}: ${host}:${port}\n`, { mode: 0o640 });
  fs.renameSync(tmp, file);
}

export function tokenExists(jobId: string): boolean {
  return fs.existsSync(fileFor(jobId));
}

export function removeToken(jobId: string): void {
  try {
    fs.unlinkSync(fileFor(jobId));
  } catch { /* already gone */ }
}

/** Drop token files older than vnc_token_ttl_hours. */
export function sweepTokens(now = Date.now()): number {
  const ttl = Number(getConfig().mainConfig.vnc_token_ttl_hours || 12) * 3600 * 1000;
  let removed = 0;
  try {
    for (const name of fs.readdirSync(tokenDir())) {
      const f = path.join(tokenDir(), name);
      try {
        if (now - fs.statSync(f).mtimeMs > ttl) {
          fs.unlinkSync(f);
          removed++;
        }
      } catch { /* raced */ }
    }
  } catch { /* no dir yet */ }
  if (removed) log.info({ removed }, 'removed expired VNC tokens');
  return removed;
}
