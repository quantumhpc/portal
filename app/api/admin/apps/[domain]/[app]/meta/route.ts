/**
 * Application details.
 *   PUT    /api/admin/apps/[domain]/[app]/meta — name, description, tags, flags, hidden, parser
 *   DELETE /api/admin/apps/[domain]/[app]/meta — delete a site-added app, or reset a shipped one
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getAppList } from "@/lib/apps";
import { deleteOrReset, pickMeta, updateMeta } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";

type Ctx = { params: Promise<{ domain: string; app: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  if (!getAppList().appList[domain]?.[app]) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  try {
    const meta = pickMeta(await req.json());
    delete meta.logo; // set through the logo route only
    updateMeta(domain, app, meta);
    return NextResponse.json({ ok: true, meta: getAppList().appList[domain][app] });
  } catch (err) {
    return adminError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  if (!getAppList().appList[domain]?.[app]) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  try {
    deleteOrReset(domain, app);
    return NextResponse.json({ ok: true, meta: getAppList().appList[domain]?.[app] ?? null });
  } catch (err) {
    return adminError(err);
  }
}
