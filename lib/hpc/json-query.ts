/**
 * Run a scheduler query, preferring its native JSON output and falling back to
 * text. Support is learned per binary on first use: output that parses as JSON
 * means supported; anything else (an "unrecognized option" error, plain text)
 * means text-only from then on. Probing this way avoids a version table.
 */

import path from 'path';
import { spawnProcess, type HpcConfig, type SpawnResult } from './exec';

const support = new Map<string, boolean>();

/** For tests: forget what was learned. */
export function resetJsonSupport(): void {
  support.clear();
}

/** PBS can emit invalid JSON escapes (e.g. "\q" from job variables); double the stray backslashes. */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'));
  }
}

export function queryJsonOrText(
  config: HpcConfig,
  binary: string,
  jsonArgs: string[],
  textArgs: string[]
): { json: any } | { text: string } {
  const exe = path.join(config.binariesDir || '', binary);
  const key = exe;
  if (support.get(key) !== false) {
    const out = spawnProcess([exe, ...jsonArgs], 'shell', null, config);
    if (out !== true) {
      let json: unknown;
      try {
        json = out.stdout.trim() ? parseLenientJson(out.stdout) : undefined;
      } catch {
        json = undefined;
      }
      if (json && typeof json === 'object') {
        support.set(key, true);
        return { json };
      }
      if (support.get(key) === true) throw new Error(out.stderr || `${binary} returned no JSON`);
      // Only a clear answer marks the binary text-only; an empty reply with an error
      // (e.g. unknown job id) just falls back this once.
      if (out.stdout.trim() || /(unrecognized|invalid|unknown|illegal) option/i.test(out.stderr)) {
        support.set(key, false);
      }
    }
  }
  const out = spawnProcess([exe, ...textArgs], 'shell', null, config);
  if (out !== true && out.stderr) throw new Error(out.stderr);
  return { text: (out as SpawnResult).stdout };
}
