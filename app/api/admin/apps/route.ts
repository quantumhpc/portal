/**
 * Admin applications.
 *   GET  /api/admin/apps  — every application, hidden ones included
 *   POST /api/admin/apps  — create { domain, app, name, description?, cloneFrom?: { domain, app } }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getAppList } from "@/lib/apps";
import { createApp, pickMeta } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(getAppList().appsAll);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const meta = pickMeta(body ?? {});
    if (!meta.name) meta.name = body?.app;
    await createApp(String(body?.domain ?? ""), String(body?.app ?? ""), meta, body?.cloneFrom);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return adminError(err);
  }
}
