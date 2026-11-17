/**
 * Dev-only scenario swap.
 * GET  /api/dev/mock — current scenario + available scenarios
 * POST /api/dev/mock { scenario: "<name>" } — switch scenario, wipe state dir
 *
 * Always 404 outside development to avoid exposure if accidentally deployed.
 */

import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";

const SCENARIO_DIR = path.join(process.cwd(), "dev", "mock-scenarios");
const STATE_ROOT = process.env.QHPC_MOCK_STATE_ROOT || "/tmp/qhpc-mock";

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

function listScenarios(): string[] {
  try {
    return fs.readdirSync(SCENARIO_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function GET() {
  const guard = devOnly();
  if (guard) return guard;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    current: process.env.QHPC_MOCK_SCENARIO || "default",
    available: listScenarios(),
    stateRoot: STATE_ROOT,
  });
}

export async function POST(req: NextRequest) {
  const guard = devOnly();
  if (guard) return guard;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = body?.scenario;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "scenario name required" }, { status: 400 });
  }
  if (!listScenarios().includes(name)) {
    return NextResponse.json({ error: `unknown scenario: ${name}` }, { status: 404 });
  }

  process.env.QHPC_MOCK_SCENARIO = name;
  // Clear state so the new scenario re-seeds on next mock invocation.
  try { fs.rmSync(STATE_ROOT, { recursive: true, force: true }); } catch {}

  return NextResponse.json({ ok: true, current: name });
}
