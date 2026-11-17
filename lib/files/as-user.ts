/**
 * Run filesystem operations as the requesting user.
 *
 * The portal runs as root. Checking permissions as the user and then acting as
 * root is racy: a user can swap a checked path for a symlink to a root-only
 * file. Every operation on a user-supplied path therefore runs in a short-lived
 * child process with the user's uid/gid, so the kernel enforces access.
 */

import { spawn, spawnSync } from 'child_process';
import { Readable } from 'stream';
import { userEnv } from '@/lib/hpc/exec';

export interface FsUser {
  uid: number;
  gid: number;
  username?: string;
  home?: string;
}

/** Plain-object subset of fs.Stats that survives JSON. */
export interface UserStat {
  size: number;
  mtimeMs: number;
  uid: number;
  gid: number;
  mode: number;
  isDir: boolean;
  isFile: boolean;
}

/** A slice of a file; `data` is base64 so byte offsets stay exact. */
export interface ByteRange {
  start: number;
  end: number;
  size: number;
  reset: boolean;
  data: string;
}

export interface ListEntry {
  name: string;
  stat: UserStat;
  readable: boolean;
}

// Runs under `node -e` in the child. Request arrives on stdin as JSON [op, ...args].
const HELPER = String.raw`
const fs = require('fs'), path = require('path');
const st = s => ({ size: s.size, mtimeMs: s.mtimeMs, uid: s.uid, gid: s.gid, mode: s.mode, isDir: s.isDirectory(), isFile: s.isFile() });
const canRead = p => { try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; } };
const ops = {
  stat: p => st(fs.statSync(p)),
  access: (p, mode) => { try { fs.accessSync(p, mode); return true; } catch { return false; } },
  list: d => fs.readdirSync(d).flatMap(name => {
    const p = path.join(d, name);
    try { return [{ name, stat: st(fs.statSync(p)), readable: canRead(p) }]; } catch { return []; }
  }),
  read: (p, enc, max) => {
    const fd = fs.openSync(p, 'r');
    try {
      const s = fs.fstatSync(fd);
      if (!s.isFile()) throw Object.assign(new Error('Cannot read a directory.'), { code: 'EISDIR' });
      if (max && s.size > max) return { stat: st(s), tooBig: true };
      return { stat: st(s), data: fs.readFileSync(fd).toString(enc) };
    } finally { fs.closeSync(fd); }
  },
  // Bytes [start, start+max). Negative start counts from the end; start past the end means the file was truncated: restart at 0.
  readRange: (p, start, max) => {
    const fd = fs.openSync(p, 'r');
    try {
      const s = fs.fstatSync(fd);
      if (!s.isFile()) throw Object.assign(new Error('Cannot read a directory.'), { code: 'EISDIR' });
      const reset = start > s.size;
      const from = reset ? 0 : start < 0 ? Math.max(0, s.size + start) : start;
      const buf = Buffer.alloc(Math.max(0, Math.min(max, s.size - from)));
      const n = buf.length ? fs.readSync(fd, buf, 0, buf.length, from) : 0;
      return { start: from, end: from + n, size: s.size, reset, data: buf.subarray(0, n).toString('base64') };
    } finally { fs.closeSync(fd); }
  },
  write: (p, data, mode) => { fs.writeFileSync(p, data, mode ? { mode } : undefined); },
  mkdir: (p, recursive) => { fs.mkdirSync(p, { recursive: !!recursive }); },
  rm: (p, force) => {
    if (fs.lstatSync(p).isDirectory()) force ? fs.rmSync(p, { recursive: true, force: true }) : fs.rmdirSync(p);
    else fs.unlinkSync(p);
  },
  rename: (a, b) => { fs.renameSync(a, b); },
  move: (a, b) => {
    try { fs.renameSync(a, b); }
    catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(a, b, { recursive: true }); fs.rmSync(a, { recursive: true, force: true }); }
  },
  copy: (a, b) => { fs.cpSync(a, b, { recursive: true }); },
  // Put file a at b without ever overwriting b (link, or exclusive copy across filesystems). Caller removes a.
  place: (a, b) => {
    try { fs.linkSync(a, b); }
    catch (e) { if (e.code !== 'EXDEV' && e.code !== 'EPERM') throw e; fs.copyFileSync(a, b, fs.constants.COPYFILE_EXCL); }
    fs.chmodSync(b, 0o666 & ~process.umask()); // like a newly created file, not the 0600 partial
  },
  statfs: p => { const s = fs.statfsSync(p); return { bsize: s.bsize, blocks: s.blocks, bfree: s.bfree }; },
  concat: (dest, srcs) => { fs.writeFileSync(dest, ''); for (const s of srcs) fs.appendFileSync(dest, fs.readFileSync(s)); },
};
let out;
try {
  const [op, ...args] = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!Object.hasOwn(ops, op)) throw new Error('Unknown op ' + op);
  out = { ok: ops[op](...args) };
} catch (e) { out = { error: { message: e.message, code: e.code } }; }
process.stdout.write(JSON.stringify(out));
`;

// shortcut: reads are buffered in memory up to this size, stream instead if bigger files must pass
const MAX_BUFFER = 256 * 1024 * 1024;

function spawnOpts(user: FsUser) {
  const uid = Number(user.uid);
  const gid = Number(user.gid);
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error('Invalid uid/gid');
  return {
    uid,
    gid,
    cwd: '/',
    env: userEnv({ username: user.username ?? '', home: user.home }) as NodeJS.ProcessEnv,
  };
}

type Ops = {
  stat: [[path: string], UserStat];
  access: [[path: string, mode: number], boolean];
  list: [[dir: string], ListEntry[]];
  read: [[path: string, encoding: 'utf8' | 'base64', maxBytes?: number], { stat: UserStat; data?: string; tooBig?: true }];
  readRange: [[path: string, start: number, maxBytes: number], ByteRange];
  write: [[path: string, data: string, mode?: number], void];
  mkdir: [[path: string, recursive?: boolean], void];
  rm: [[path: string, force?: boolean], void];
  rename: [[from: string, to: string], void];
  move: [[from: string, to: string], void];
  copy: [[from: string, to: string], void];
  place: [[from: string, to: string], void];
  statfs: [[path: string], { bsize: number; blocks: number; bfree: number }];
  concat: [[dest: string, sources: string[]], void];
};

/** Run one fs operation as `user`. Throws an Error carrying the child's errno `code`. */
export function asUser<K extends keyof Ops>(user: FsUser, op: K, ...args: Ops[K][0]): Ops[K][1] {
  const res = spawnSync(process.execPath, ['-e', HELPER], {
    ...spawnOpts(user),
    input: JSON.stringify([op, ...args]),
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  if (res.error) throw res.error;
  return parseResult<Ops[K][1]>(res.stdout, res.stderr || `exit ${res.status}`);
}

/** Same as asUser, without blocking the event loop. Use on hot paths (tailing). */
export function asUserAsync<K extends keyof Ops>(user: FsUser, op: K, ...args: Ops[K][0]): Promise<Ops[K][1]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', HELPER], { ...spawnOpts(user), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try { resolve(parseResult<Ops[K][1]>(out, err || `exit ${code}`)); } catch (e) { reject(e); }
    });
    child.stdin.on('error', () => {}); // EPIPE if the child dies early; 'close' reports it
    child.stdin.end(JSON.stringify([op, ...args]));
  });
}

function parseResult<T>(stdout: string, failure: string): T {
  let parsed: { ok?: T; error?: { message: string; code?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`File helper failed: ${failure}`);
  }
  if (parsed.error) {
    throw Object.assign(new Error(parsed.error.message), { code: parsed.error.code });
  }
  return parsed.ok as T;
}

/** Stream stdout of a command run as `user` (e.g. `cat`, `tar`). */
export function streamAsUser(user: FsUser, cmd: string, args: string[]): ReadableStream<Uint8Array> {
  const child = spawn(cmd, args, { ...spawnOpts(user), stdio: ['ignore', 'pipe', 'ignore'] });
  return Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
}
