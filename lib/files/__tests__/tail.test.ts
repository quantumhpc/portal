import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { asUser, asUserAsync } from '../as-user';
import { tailStream, INITIAL_TAIL_BYTES, MAX_CHUNK_BYTES } from '../tail';

const me = { uid: process.getuid!(), gid: process.getgid!() };
let file: string;

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tail-')), 'out.log');
});

const text = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');

describe('readRange', () => {
  beforeEach(() => fs.writeFileSync(file, '0123456789'));

  it('reads from the start, the middle and the end', () => {
    expect(asUser(me, 'readRange', file, 0, 4)).toMatchObject({ start: 0, end: 4, size: 10, reset: false });
    expect(text(asUser(me, 'readRange', file, 6, 100).data)).toBe('6789');
    expect(asUser(me, 'readRange', file, 10, 100)).toMatchObject({ start: 10, end: 10, data: '' });
  });

  it('counts a negative start from the end', () => {
    expect(text(asUser(me, 'readRange', file, -3, 100).data)).toBe('789');
    expect(asUser(me, 'readRange', file, -100, 100).start).toBe(0);
  });

  it('restarts at 0 when the file was truncated', () => {
    expect(asUser(me, 'readRange', file, 50, 100)).toMatchObject({ start: 0, end: 10, reset: true });
  });

  it('keeps multi-byte characters intact across byte offsets', async () => {
    fs.writeFileSync(file, 'é'); // 2 bytes
    const a = await asUserAsync(me, 'readRange', file, 0, 1);
    const b = await asUserAsync(me, 'readRange', file, a.end, 1);
    expect(Buffer.concat([Buffer.from(a.data, 'base64'), Buffer.from(b.data, 'base64')]).toString()).toBe('é');
  });
});

/** Collect SSE events until the stream closes. */
async function collect(stream: ReadableStream<Uint8Array>, onEvent?: (n: number) => void) {
  const events: { id?: number; event: string; data: any }[] = [];
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of stream as any) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const f = Object.fromEntries(block.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
      events.push({ id: f.id ? Number(f.id) : undefined, event: f.event, data: JSON.parse(f.data) });
      onEvent?.(events.length);
    }
  }
  return events;
}

describe('tailStream', () => {
  it('sends only the last 64 KB first, then only new bytes, then end', async () => {
    fs.writeFileSync(file, 'x'.repeat(INITIAL_TAIL_BYTES + 100));
    let done = false;
    const events = await collect(
      tailStream({ user: me, file, signal: new AbortController().signal, intervalMs: 20, doneEvery: 1, isDone: async () => done }),
      (n) => {
        if (n === 1) fs.appendFileSync(file, 'new line\n');
        if (n === 2) done = true;
      },
    );
    expect(events.map((e) => e.event)).toEqual(['chunk', 'chunk', 'end']);
    expect(Buffer.from(events[0].data.data, 'base64')).toHaveLength(INITIAL_TAIL_BYTES);
    expect(text(events[1].data.data)).toBe('new line\n');
    expect(events[1].id).toBe(INITIAL_TAIL_BYTES + 100 + 9);
  });

  it('resumes from a Last-Event-ID offset', async () => {
    fs.writeFileSync(file, 'already seen|fresh');
    const events = await collect(
      tailStream({ user: me, file, offset: 13, signal: new AbortController().signal, isDone: async () => true }),
    );
    expect(text(events[0].data.data)).toBe('fresh');
  });

  it('splits a burst into chunks of at most 256 KB within one tick', async () => {
    fs.writeFileSync(file, 'y'.repeat(MAX_CHUNK_BYTES * 2 + 1));
    const events = await collect(
      tailStream({ user: me, file, offset: 0, signal: new AbortController().signal, isDone: async () => true }),
    );
    expect(events.map((e) => e.event)).toEqual(['chunk', 'chunk', 'chunk', 'end']);
    expect(events[2].id).toBe(MAX_CHUNK_BYTES * 2 + 1);
  });

  it('waits for a file that does not exist yet', async () => {
    let done = false;
    const events = await collect(
      tailStream({ user: me, file, signal: new AbortController().signal, intervalMs: 20, doneEvery: 1, isDone: async () => {
        if (!fs.existsSync(file)) { fs.writeFileSync(file, 'late'); return false; }
        return done = true;
      } }),
    );
    expect(done).toBe(true);
    expect(events.map((e) => e.event)).toEqual(['chunk', 'end']);
    expect(text(events[0].data.data)).toBe('late');
  });

  it('stops when the client aborts', async () => {
    fs.writeFileSync(file, 'a');
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const events = await collect(tailStream({ user: me, file, signal: ac.signal, intervalMs: 10_000, isDone: async () => false }));
    expect(events.map((e) => e.event)).toEqual(['chunk']);
  });
});
