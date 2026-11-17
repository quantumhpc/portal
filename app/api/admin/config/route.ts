import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { loadJson, invalidate } from "@/lib/config/cache";
import { globalConfigPath as configPath } from "@/lib/config";
import fs from "fs";
import { HpcConfigSchema } from "@/lib/hpc/config-schema";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    // A fresh install may not have written config.json yet — start from empty.
    const data = fs.existsSync(configPath) ? loadJson(configPath) : {};
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Config must be an object" }, { status: 400 });
  }

  // Changes apply immediately, so refuse a config that would break the running portal.
  const cfg = body as Record<string, any>;
  if (cfg.manager !== undefined && !["slurm", "pbs"].includes(cfg.manager)) {
    return NextResponse.json({ error: "manager must be \"slurm\" or \"pbs\"" }, { status: 400 });
  }
  for (const [name, block] of Object.entries((cfg.managers ?? {}) as Record<string, unknown>)) {
    const parsed = HpcConfigSchema.safeParse(block);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ error: `managers.${name}: ${issues}` }, { status: 400 });
    }
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(body, null, 2) + "\n", "utf-8");
    invalidate(configPath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to write config" }, { status: 500 });
  }
}
