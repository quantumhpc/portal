import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { asUser } from '../as-user';

const me = { uid: process.getuid!(), gid: process.getgid!(), username: os.userInfo().username, home: os.homedir() };
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-user-'));
});

describe('asUser', () => {
  it('writes, reads, lists and removes', () => {
    const f = path.join(dir, 'a.txt');
    asUser(me, 'write', f, 'hello');
    expect(asUser(me, 'read', f, 'utf8')).toMatchObject({ data: 'hello', stat: { size: 5, isFile: true } });
    expect(asUser(me, 'list', dir).map(e => e.name)).toEqual(['a.txt']);
    asUser(me, 'rm', f);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('passes large payloads through stdin, not argv', () => {
    const big = 'x'.repeat(1_000_000);
    const f = path.join(dir, 'big.txt');
    asUser(me, 'write', f, big);
    expect(asUser(me, 'read', f, 'utf8').data).toHaveLength(big.length);
  });

  it('reports tooBig instead of reading past the cap', () => {
    const f = path.join(dir, 'b.txt');
    fs.writeFileSync(f, '0123456789');
    expect(asUser(me, 'read', f, 'utf8', 5)).toMatchObject({ tooBig: true });
  });

  it('keeps the errno code', () => {
    expect(() => asUser(me, 'read', path.join(dir, 'nope'), 'utf8')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
    expect(() => asUser(me, 'mkdir', dir)).toThrow(expect.objectContaining({ code: 'EEXIST' }));
  });

  it('refuses to read a directory', () => {
    expect(() => asUser(me, 'read', dir, 'utf8')).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });

  it('concatenates chunks', () => {
    const a = path.join(dir, '1'), b = path.join(dir, '2'), out = path.join(dir, 'out');
    fs.writeFileSync(a, 'ab');
    fs.writeFileSync(b, 'cd');
    asUser(me, 'concat', out, [a, b]);
    expect(fs.readFileSync(out, 'utf8')).toBe('abcd');
  });

  it('rejects unknown ops and bad ids', () => {
    expect(() => asUser(me, 'eval' as any)).toThrow(/Unknown op/);
    expect(() => asUser({ uid: NaN, gid: 0 }, 'stat', dir)).toThrow(/Invalid uid/);
  });

  it.skipIf(process.getuid!() === 0)('really switches uid (non-root cannot become root)', () => {
    expect(() => asUser({ uid: 0, gid: 0 }, 'stat', dir)).toThrow(expect.objectContaining({ code: 'EPERM' }));
  });
});
