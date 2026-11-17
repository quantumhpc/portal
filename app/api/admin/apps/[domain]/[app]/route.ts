/**
 * Admin job-form editor for one application.
 *   GET    /api/admin/apps/[domain]/[app]   — meta + merged form + admin override + layer info
 *   PUT    /api/admin/apps/[domain]/[app]   — save the form override (fields + parameters)
 *   DELETE /api/admin/apps/[domain]/[app]   — remove the form override
 *
 * Overrides are a drop-in, $QHPC_CONFIG_DIR/apps/templates/{domain}/{app}.d/95-admin.json,
 * using the `key=` force-replace operator. They apply immediately, with no restart.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getAppList, getAppForm, appPaths } from "@/lib/apps";
import { OVERRIDE_FILE, readFormOverride, removeFormOverride, saveFormOverride } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";
import fs from "fs";

type Ctx = { params: Promise<{ domain: string; app: string }> };

function lookup(domain: string, app: string) {
  return getAppList().appList[domain]?.[app] ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  const meta = lookup(domain, app);
  if (!meta) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  try {
    const form = await getAppForm(domain, app);
    const p = appPaths(domain, app);
    const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);
    return NextResponse.json({
      meta,
      form,
      override: readFormOverride(domain, app),
      layers: {
        base: fs.existsSync(p.siteBase) ? "site" : "shipped",
        dropins: [...list(p.shippedDropin), ...list(p.siteDropin)],
        overrideFile: OVERRIDE_FILE,
      },
    });
  } catch (err) {
    return adminError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  if (!lookup(domain, app)) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObj(body) || !isObj(body.fields ?? {}) || !isObj(body.parameters ?? {})) {
    return NextResponse.json(
      { error: "Body must be an object with 'fields' and 'parameters' objects" },
      { status: 400 },
    );
  }

  try {
    saveFormOverride(domain, app, body);
    return NextResponse.json({ ok: true, form: await getAppForm(domain, app) });
  } catch (err) {
    return adminError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  if (!lookup(domain, app)) return NextResponse.json({ error: "Unknown application" }, { status: 404 });

  try {
    removeFormOverride(domain, app);
    return NextResponse.json({ ok: true, form: await getAppForm(domain, app) });
  } catch (err) {
    return adminError(err);
  }
}
