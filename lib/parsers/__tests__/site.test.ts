import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qhpc-parsers-"));
const parsers = path.join(dir, "apps", "parsers");

let site: typeof import("../site");
let index: typeof import("..");

beforeAll(async () => {
  vi.stubEnv("QHPC_CONFIG_DIR", dir);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tmpdir: path.join(dir, "tmp") }));
  fs.mkdirSync(parsers, { recursive: true, mode: 0o755 });
  fs.chmodSync(parsers, 0o755);
  site = await import("../site");
  index = await import("..");
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const JS = `module.exports = {
  require: "outputFile",
  post(text, startLine, startIter, files, next) {
    const n = text.split("\\n").filter((l) => l.startsWith("it")).length;
    next(null, { graph: [{ label: "it", data: [[1, n]] }], markings: [], step: { lastLine: 0 } });
  },
};`;

describe("site parsers", () => {
  it("loads a JS drop-in owned by the portal user", async () => {
    const file = path.join(parsers, "mine.js");
    fs.writeFileSync(file, JS, { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    const entry = site.loadFileParser("mine");
    const result = await new Promise<any>((resolve) => entry.post!("it\nit\nx", 0, 0, {}, (_e, r) => resolve(r)));
    expect(result.graph[0].data).toEqual([[1, 2]]);
  });

  it("refuses a group- or world-writable drop-in", () => {
    const file = path.join(parsers, "open.js");
    fs.writeFileSync(file, JS);
    fs.chmodSync(file, 0o666);
    expect(() => site.loadFileParser("open")).toThrow(/must not be writable/);
    expect(site.listSiteParsers().find((p) => p.id === "open")?.error).toMatch(/must not be writable/);
  });

  it("refuses ids with path characters", () => {
    expect(() => site.loadFileParser("../../etc/x")).toThrow(/Parser ids/);
  });

  it("saves recipes only when the patterns compile", () => {
    expect(() => site.saveRecipe("bad", { series: [{ pattern: "[", label: "x" }] })).toThrow();
    site.saveRecipe("good", { series: [{ pattern: "v=([0-9]+)", label: "v" }] });
    expect(site.readRecipe("good")?.series[0].label).toBe("v");
  });

  it("resolves an app's parser from its setting, falling back to the built-in of the same name", () => {
    expect(index.parserRef({ appName: "openfoam", parser: { post: ["outputFile"] } })).toEqual({ source: "builtin", id: "openfoam" });
    expect(index.resolveParser("cfd", "openfoam")?.post).toBeTypeOf("function");
    expect(index.resolveParser("cfd", "lms_sysnoise")).toBeNull();
  });
});
