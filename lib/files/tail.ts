/**
 * Follow a growing file as Server-Sent Events, reading as the user.
 *
 * Events:
 *   id: <byte offset after this chunk>   (browser resends it as Last-Event-ID on reconnect)
 *   event: chunk  data: {"data": base64, "reset": bool}
 *   event: end    (job finished, everything sent)
 *   event: error  data: {"message": string}
 *
 * A missing file is not an error: pending jobs have no output yet.
 */

import { asUserAsync, type FsUser } from './as-user';

export const INITIAL_TAIL_BYTES = 64 * 1024;
export const MAX_CHUNK_BYTES = 256 * 1024;

export interface TailOptions {
  user: FsUser;
  file: string;
  /** Byte offset to resume from (Last-Event-ID); undefined = last INITIAL_TAIL_BYTES. */
  offset?: number;
  /** Resolves true once the job is in a terminal state. */
  isDone: () => Promise<boolean>;
  signal: AbortSignal;
  intervalMs?: number;
  /** How many ticks between isDone checks. */
  doneEvery?: number;
}

const enc = new TextEncoder();
const sse = (event: string, data: unknown, id?: number) =>
  enc.encode(`${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export function tailStream(opts: TailOptions): ReadableStream<Uint8Array> {
  const { user, file, isDone, signal, intervalMs = 2000, doneEvery = 5 } = opts;
  let offset = opts.offset ?? -INITIAL_TAIL_BYTES;

  let closed = false;

  return new ReadableStream({
    async start(controller) {
      const stopped = () => closed || signal.aborted;
      const send = (chunk: Uint8Array) => {
        try { controller.enqueue(chunk); } catch { closed = true; }
      };
      const sleep = () => new Promise<void>((r) => {
        if (stopped()) return r();
        const t = setTimeout(r, intervalMs);
        signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
      });

      // Read until caught up: one tick may need several chunks after a burst of output.
      const drain = async () => {
        while (!stopped()) {
          let r;
          try {
            r = await asUserAsync(user, 'readRange', file, offset, MAX_CHUNK_BYTES);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // job hasn't written output yet
            throw err;
          }
          if (r.end === r.start && !r.reset) { offset = r.end; return; }
          offset = r.end;
          send(sse('chunk', { data: r.data, reset: r.reset }, offset));
          if (r.end >= r.size) return;
        }
      };

      try {
        for (let tick = 0; !stopped(); tick++) {
          const done = tick % doneEvery === 0 && (await isDone());
          await drain();
          if (done) { send(sse('end', {})); break; }
          await sleep();
        }
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        const message = err.code === 'EACCES' || err.code === 'EPERM'
          ? 'You are not authorized to read the output file'
          : err.message;
        send(sse('error', { message }));
      }
      try { controller.close(); } catch { /* client already gone */ }
    },
    cancel() {
      closed = true;
    },
  });
}
