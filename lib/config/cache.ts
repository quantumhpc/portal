import fs from "fs";
import { parse } from 'comment-json';

interface Entry {
  mtimeMs: number;
  value: unknown;
}

const cache = new Map<string, Entry>();
const watchers = new Map<string, fs.FSWatcher>();

export function loadJson<T = unknown>(absPath: string): T {
  const stat = fs.statSync(absPath);
  const hit = cache.get(absPath);
  if (hit && hit.mtimeMs === stat.mtimeMs) {
    return hit.value as T;
  }
  const value = parse<T>(fs.readFileSync(absPath, "utf-8"), null, true);
  cache.set(absPath, { mtimeMs: stat.mtimeMs, value });
  return value;
}

export function tryLoadJson<T = unknown>(absPath: string): T | null {
  try {
    return loadJson<T>(absPath);
  } catch {
    return null;
  }
}

export function invalidate(absPath?: string): void {
  if (absPath) {
    cache.delete(absPath);
  } else {
    cache.clear();
  }
}

/** Best-effort dev-only watcher that drops the cache entry when the file changes. */
export function watch(absPath: string): void {
  if (watchers.has(absPath)) return;
  try {
    const w = fs.watch(absPath, () => invalidate(absPath));
    watchers.set(absPath, w);
  } catch {
    // file may not exist yet or platform may lack fs.watch
  }
}
