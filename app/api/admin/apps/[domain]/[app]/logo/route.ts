/**
 * POST /api/admin/apps/[domain]/[app]/logo — multipart field "file": PNG, JPEG or WebP, max 512 KB.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getAppList } from "@/lib/apps";
import { saveLogo } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";

type Ctx = { params: Promise<{ domain: string; app: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  if (!getAppList().appList[domain]?.[app]) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    const logo = saveLogo(domain, app, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, logo });
  } catch (err) {
    return adminError(err);
  }
}
