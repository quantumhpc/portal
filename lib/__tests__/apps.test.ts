import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// The site folder lives under QHPC_CONFIG_DIR, which lib/config reads at import time.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qhpc-apps-"));

let apps: typeof import("../apps");
let admin: typeof import("../apps-admin");

beforeAll(async () => {
  vi.stubEnv("QHPC_CONFIG_DIR", dir);
  vi.stubEnv("HPC_MANAGER", "slurm");
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ tmpdir: path.join(dir, "tmp") }));
  apps = await import("../apps");
  admin = await import("../apps-admin");
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("application layers", () => {
  it("lists shipped apps by default", () => {
    const { appList } = apps.getAppList();
    expect(appList.cfd.openfoam.origin).toBe("shipped");
    expect(appList.cfd.openfoam.name).toBe("OpenFOAM");
  });

  it("creates a site app that users see at once, with no write under apps/", async () => {
    await admin.createApp("demo", "mysolver", { name: "My solver" });
    const list = apps.getAppList();
    expect(list.appsJson.some((a) => a.appName === "mysolver")).toBe(true);
    expect(list.appList.demo.mysolver.origin).toBe("site");
    expect(fs.existsSync(path.join(dir, "apps/templates/demo/mysolver.json"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "apps/templates/demo"))).toBe(false);
    const form = await apps.getAppForm("demo", "mysolver");
    expect(form.parameters.default.outputFile).toBe("output.log"); // global drop-in applied
  });

  it("refuses bad ids and duplicates", async () => {
    await expect(admin.createApp("Demo", "../x", { name: "x" })).rejects.toThrow(/Ids must be/);
    await expect(admin.createApp("demo", "mysolver", { name: "x" })).rejects.toThrow(/already exists/);
  });

  it("hides a shipped app from users but keeps it for admins", () => {
    admin.updateMeta("cfd", "openfoam", { hidden: true });
    const list = apps.getAppList();
    expect(list.appsJson.some((a) => a.appName === "openfoam")).toBe(false);
    expect(list.appsAll.some((a) => a.appName === "openfoam")).toBe(true);
  });

  it("applies a form override from the site folder and resets it", async () => {
    admin.saveFormOverride("cfd", "openfoam", { fields: { x: { type: "textField", label: "X" } } });
    expect(Object.keys((await apps.getAppForm("cfd", "openfoam")).fields)).toEqual(["x"]);
    admin.deleteOrReset("cfd", "openfoam");
    const form = await apps.getAppForm("cfd", "openfoam");
    expect(form.fields.solver).toBeDefined();
    expect(apps.getAppList().appList.cfd.openfoam.hidden).toBeUndefined();
  });

  it("exports without global drop-ins and imports under a new id", async () => {
    const bundle = await admin.exportApp("cfd", "openfoam");
    expect((bundle.form as any).parameters.default.outputFile).toBeUndefined();
    admin.importApp(admin.validateBundle({ ...bundle, domain: "demo", app: "foam2" }), false);
    const form = await apps.getAppForm("demo", "foam2");
    expect(form.fields.solver).toBeDefined();
    expect(form.parameters.default.outputFile).toBe("output.log");
  });

  it("deletes a site app", () => {
    admin.deleteOrReset("demo", "mysolver");
    expect(apps.getAppList().appList.demo?.mysolver).toBeUndefined();
  });

  it("accepts PNG logos and refuses SVG", () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    expect(admin.saveLogo("demo", "foam2", png)).toMatch(/^\/apps\/demo--foam2\.png\?v=/);
    expect(() => admin.saveLogo("demo", "foam2", Buffer.from("<svg onload=alert(1)>"))).toThrow(/PNG, JPEG or WebP/);
  });
});
