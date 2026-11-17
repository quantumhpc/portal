import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tus-'));
vi.mock('@/lib/config', () => ({ getConfig: () => ({ mainConfig: { tmpdir: tmp, upload_max_size_gb: 1 } }) }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), error: vi.fn() } }));

const { currentUser, getTusServer } = await import('../upload');

const sys = { uid: process.getuid!(), gid: process.getgid!(), username: os.userInfo().username, home: os.homedir(), shell: '/bin/sh' };
const alice = { _id: 'alice', username: 'alice', admin: { isAdmin: false, active: true }, system: sys } as any;
const bob = { ...alice, _id: 'bob' };

const BASE = 'http://localhost/api/data/tus';
const meta = (m: Record<string, string>) =>
  Object.entries(m).map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',');

function call(user: any, url: string, init: RequestInit) {
  const req = new Request(url, { ...init, headers: { 'Tus-Resumable': '1.0.0', ...init.headers } });
  return user ? currentUser.run(user, () => getTusServer().handleWeb(req)) : getTusServer().handleWeb(req);
}

async function create(user: any, dest: string, name: string, length: number) {
  return call(user, BASE, { method: 'POST', headers: { 'Upload-Length': String(length), 'Upload-Metadata': meta({ name, destination: dest }) } });
}

function patch(user: any, location: string, offset: number, body: string) {
  return call(user, new URL(location, BASE).href, {
    method: 'PATCH',
    headers: { 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
    body,
  });
}

let dest: string;
beforeAll(() => getTusServer());
beforeEach(() => {
  dest = fs.mkdtempSync(path.join(tmp, 'dest-'));
});

describe('tus upload', () => {
  it('uploads in two parts and places the file, leaving no partials behind', async () => {
    const res = await create(alice, dest, 'data.txt', 11);
    expect(res.status).toBe(201);
    const loc = res.headers.get('Location')!;
    expect((await patch(alice, loc, 0, 'hello ')).status).toBe(204);
    const last = await patch(alice, loc, 6, 'world');
    expect(last.status).toBe(204);
    expect(last.headers.get('Upload-Target')).toBe(path.join(dest, 'data.txt'));
    expect(fs.readFileSync(path.join(dest, 'data.txt'), 'utf8')).toBe('hello world');
    expect(fs.statSync(path.join(dest, 'data.txt')).mode & 0o777).toBe(0o666 & ~process.umask());
    expect(fs.readdirSync(path.join(tmp, '.partials', 'tus'))).toEqual([]);
  });

  it('keeps only the basename of the file name', async () => {
    const res = await create(alice, dest, '../../escape.txt', 1);
    await patch(alice, res.headers.get('Location')!, 0, 'x');
    expect(fs.existsSync(path.join(dest, 'escape.txt'))).toBe(true);
  });

  it('refuses another user on an existing upload', async () => {
    const loc = (await create(alice, dest, 'mine.txt', 3)).headers.get('Location')!;
    expect((await patch(bob, loc, 0, 'abc')).status).toBe(404);
    expect(fs.existsSync(path.join(dest, 'mine.txt'))).toBe(false);
  });

  it('refuses requests without a user', async () => {
    expect((await create(null, dest, 'a.txt', 1)).status).toBe(401);
  });

  it('refuses to overwrite an existing file', async () => {
    fs.writeFileSync(path.join(dest, 'taken.txt'), 'keep');
    expect((await create(alice, dest, 'taken.txt', 1)).status).toBe(409);
    expect(fs.readFileSync(path.join(dest, 'taken.txt'), 'utf8')).toBe('keep');
  });

  it.skipIf(process.getuid!() === 0)('refuses a folder the user cannot write', async () => {
    fs.chmodSync(dest, 0o555);
    expect((await create(alice, dest, 'a.txt', 1)).status).toBe(403);
  });

  it('refuses uploads over the size limit', async () => {
    expect((await create(alice, dest, 'big.bin', 2 * 1024 ** 3)).status).toBe(413);
  });

  it('puts job inputs (no destination) in a fresh folder each time', async () => {
    const paths: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await create(alice, '', 'input.dat', 1);
      expect(res.status).toBe(201);
      paths.push((await patch(alice, res.headers.get('Location')!, 0, 'x')).headers.get('Upload-Target')!);
    }
    expect(paths[0]).not.toBe(paths[1]);
    for (const p of paths) {
      expect(p.startsWith(path.join(tmp, 'uploads', 'alice'))).toBe(true);
      expect(fs.readFileSync(p, 'utf8')).toBe('x');
    }
  });

  it('refuses a relative destination', async () => {
    expect((await create(alice, 'relative/dir', 'a.txt', 1)).status).toBe(400);
  });
});
