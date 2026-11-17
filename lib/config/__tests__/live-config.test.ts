import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qhpc-live-config-"));
const file = path.join(dir, "config.json");

function write(cfg: object, bumpMs: number) {
  fs.writeFileSync(file, JSON.stringify(cfg));
  // mtime-based cache: make sure each write gets a distinct mtime
  const t = new Date(Date.now() + bumpMs);
  fs.utimesSync(file, t, t);
}

let config: typeof import("../../config").config;

beforeAll(async () => {
  vi.stubEnv("QHPC_CONFIG_DIR", dir);
  vi.stubEnv("HPC_MANAGER", "");
  vi.stubEnv("ADMIN_USERS", undefined as unknown as string);
  write({ remote: "turbovnc", admin_users: ["alice"], tmpdir: path.join(dir, "tmp") }, 0);
  ({ config } = await import("../../config"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("live config", () => {
  it("picks up a changed config.json without re-importing", () => {
    expect(config.mainConfig.remote).toBe("turbovnc");
    expect(config.mainConfig.admin_users).toEqual(["alice"]);

    write({ remote: "tigervnc", admin_users: ["alice", "bob"], tmpdir: "/elsewhere" }, 5000);

    expect(config.mainConfig.remote).toBe("tigervnc");
    expect(config.mainConfig.admin_users).toEqual(["alice", "bob"]);
  });

  it("keeps restart-only tmpdir from startup", () => {
    expect(config.mainConfig.tmpdir).toBe(path.join(dir, "tmp"));
  });

  it("returns the same object while the file is unchanged", () => {
    expect(config.mainConfig).toBe(config.mainConfig);
  });
});
