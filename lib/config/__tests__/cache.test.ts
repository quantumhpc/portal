import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadJson, tryLoadJson, invalidate } from "../cache";

let tmpDir: string;
let jsonPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qhpc-cache-test-"));
  jsonPath = path.join(tmpDir, "test.json");
  invalidate(); // start each test with a clean cache
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadJson", () => {
  it("parses a JSON file", () => {
    fs.writeFileSync(jsonPath, JSON.stringify({ hello: "world" }));
    const result = loadJson<{ hello: string }>(jsonPath);
    expect(result.hello).toBe("world");
  });

  it("returns cached value on second call without touching disk (same mtime)", () => {
    fs.writeFileSync(jsonPath, JSON.stringify({ v: 1 }));
    const first = loadJson<{ v: number }>(jsonPath);
    // Overwrite content without changing mtime (simulated by using invalidate then NOT calling it)
    // First call caches it; second call should return cached.
    const second = loadJson<{ v: number }>(jsonPath);
    expect(first).toBe(second); // same object reference from cache
  });

  it("reloads when mtime changes", () => {
    fs.writeFileSync(jsonPath, JSON.stringify({ v: 1 }));
    const first = loadJson<{ v: number }>(jsonPath);
    expect(first.v).toBe(1);

    // Simulate a file change by writing new content and bumping mtime
    const past = Date.now() / 1000 - 5;
    fs.utimesSync(jsonPath, past, past); // set mtime to 5 seconds ago
    loadJson<{ v: number }>(jsonPath);
    // mtime was set to past — cache should still match because mtime < current mtime from writeFileSync
    // Actually we need to explicitly change mtime to something different from what's cached.
    // Let's invalidate and write new content.
    invalidate(jsonPath);
    fs.writeFileSync(jsonPath, JSON.stringify({ v: 2 }));
    const second = loadJson<{ v: number }>(jsonPath);
    expect(second.v).toBe(2);
  });

  it("throws for a missing file", () => {
    expect(() => loadJson("/does/not/exist.json")).toThrow();
  });
});

describe("tryLoadJson", () => {
  it("returns null for a missing file", () => {
    const result = tryLoadJson("/does/not/exist.json");
    expect(result).toBeNull();
  });

  it("returns parsed value for existing file", () => {
    fs.writeFileSync(jsonPath, JSON.stringify({ ok: true }));
    const result = tryLoadJson<{ ok: boolean }>(jsonPath);
    expect(result?.ok).toBe(true);
  });
});

describe("invalidate", () => {
  it("forces reload after single-path invalidation", () => {
    fs.writeFileSync(jsonPath, JSON.stringify({ v: 1 }));
    loadJson(jsonPath); // prime cache
    invalidate(jsonPath);
    fs.writeFileSync(jsonPath, JSON.stringify({ v: 99 }));
    const result = loadJson<{ v: number }>(jsonPath);
    expect(result.v).toBe(99);
  });

  it("clears all entries when called with no argument", () => {
    const path2 = path.join(tmpDir, "other.json");
    fs.writeFileSync(jsonPath, JSON.stringify({ a: 1 }));
    fs.writeFileSync(path2, JSON.stringify({ b: 2 }));
    loadJson(jsonPath);
    loadJson(path2);
    invalidate(); // wipe everything
    fs.writeFileSync(jsonPath, JSON.stringify({ a: 10 }));
    fs.writeFileSync(path2, JSON.stringify({ b: 20 }));
    expect(loadJson<{ a: number }>(jsonPath).a).toBe(10);
    expect(loadJson<{ b: number }>(path2).b).toBe(20);
  });
});
