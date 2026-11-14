import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vnc-'));
const tokens = path.join(tmp, 'tokens');
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ mainConfig: { tmpdir: tmp, vnc_token_dir: tokens, vnc_token_ttl_hours: 12, vnc_websocket_url: '/vnc-ws' } }),
}));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), error: vi.fn() } }));

// In-memory job store standing in for the DB.
let jobs: any[] = [];
vi.mock('@/lib/db/jobs', () => ({
  getJobInfo: async (userId: string, jobId?: string) =>
    jobs.filter((j) => j.jobInfo.userId === userId && (!jobId || j.jobId === jobId)),
}));
vi.mock('@/lib/db/connection', () => ({
  getDb: async () => ({
    collection: () => ({
      updateOne: async (f: any, u: any) => {
        const j = jobs.find((x) => x.jobId === f.jobId && x.jobInfo.userId === f['jobInfo.userId']);
        if (j) j.jobInfo.vnc = u.$set['jobInfo.vnc'];
      },
      findOne: async (f: any) =>
        jobs.find((x) => x.jobInfo.userId === f['jobInfo.userId'] && x.jobInfo.vnc?.token === f['jobInfo.vnc.token']) ?? null,
    }),
  }),
}));

const { parseConnection, getVncSession, authorizeToken } = await import('../session');
const { writeToken, sweepTokens, tokenExists } = await import('../tokens');

const sys = { uid: process.getuid!(), gid: process.getgid!(), username: os.userInfo().username, home: os.homedir() };
const alice = { _id: 'alice', system: sys };
let workdir: string;

function remoteJob(id: string, status = 'Running') {
  return {
    jobId: id,
    server: { status },
    jobInfo: { userId: 'alice', jobName: 'desk', jobArgs: { type: 'remote', connectionFile: path.join(workdir, 'desk.vnc') } },
  };
}

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(tmp, 'job-'));
  jobs = [];
});

describe('parseConnection', () => {
  it('reads host, port and password', () => {
    expect(parseConnection('host=n01.cluster\nport=5912\npassword=Ab3dE6gH\n')).toEqual({ host: 'n01.cluster', port: 5912, password: 'Ab3dE6gH' });
  });
  it('rejects an incomplete file', () => {
    expect(() => parseConnection('host=n01\nport=x\n')).toThrow(/Incomplete/);
  });
});

describe('writeToken', () => {
  it('writes the websockify line, root-only readable by group', () => {
    writeToken('42', 'tok', 'n01.cluster', 5901);
    const f = path.join(tokens, '42');
    expect(fs.readFileSync(f, 'utf8')).toBe('tok: n01.cluster:5901\n');
    expect(fs.statSync(f).mode & 0o777).toBe(0o640 & ~process.umask());
  });
  it('refuses hosts and ports a user could abuse', () => {
    expect(() => writeToken('1', 't', 'evil host', 5901)).toThrow(/host/);
    expect(() => writeToken('1', 't', 'n01\nother: 127.0.0.1', 5901)).toThrow(/host/);
    expect(() => writeToken('1', 't', 'n01', 22)).toThrow(/port/);
  });
  it('keeps job ids inside the token folder', () => {
    writeToken('../../escape', 't', 'n01', 5901);
    expect(fs.existsSync(path.join(tokens, '.._.._escape'))).toBe(true);
  });
  it('sweeps tokens past their TTL', () => {
    writeToken('old', 't', 'n01', 5901);
    expect(sweepTokens(Date.now() + 13 * 3600 * 1000)).toBeGreaterThan(0);
    expect(tokenExists('old')).toBe(false);
  });
});

describe('getVncSession / authorizeToken', () => {
  it('waits until the job writes its .web file, then routes a token', async () => {
    jobs.push(remoteJob('100'));
    expect(await getVncSession(alice, '100')).toMatchObject({ ready: false, reason: 'The desktop is starting…' });

    fs.writeFileSync(path.join(workdir, 'desk.web'), 'host=n01.cluster\nport=5903\npassword=pw123456\n', { mode: 0o600 });
    const s = await getVncSession(alice, '100');
    expect(s).toMatchObject({ ready: true, password: 'pw123456' });
    const token = new URL((s as any).url, 'http://x').searchParams.get('token')!;
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(fs.readFileSync(path.join(tokens, '100'), 'utf8')).toBe(`${token}: n01.cluster:5903\n`);

    // Same session on the next call, and only its owner passes the proxy check.
    expect((await getVncSession(alice, '100') as any).url).toBe((s as any).url);
    expect(await authorizeToken('alice', token)).toBe(true);
    expect(await authorizeToken('bob', token)).toBe(false);
    expect(await authorizeToken('alice', token + 'x')).toBe(false);
    expect(await authorizeToken('alice', '')).toBe(false);
  });

  it('refuses ended sessions and non-remote jobs', async () => {
    jobs.push(remoteJob('200', 'Completed'), { ...remoteJob('300'), jobInfo: { ...remoteJob('300').jobInfo, jobArgs: { type: 'batch' } } });
    expect(await getVncSession(alice, '200')).toMatchObject({ ready: false, reason: 'The session has ended.' });
    expect(await getVncSession(alice, '300')).toBeNull();
    expect(await getVncSession(alice, 'missing')).toBeNull();
  });

  it('stops authorizing once the token file is gone', async () => {
    jobs.push(remoteJob('400'));
    fs.writeFileSync(path.join(workdir, 'desk.web'), 'host=n01\nport=5904\npassword=p\n');
    const s = await getVncSession(alice, '400');
    const token = new URL((s as any).url, 'http://x').searchParams.get('token')!;
    fs.unlinkSync(path.join(tokens, '400'));
    expect(await authorizeToken('alice', token)).toBe(false);
  });
});
