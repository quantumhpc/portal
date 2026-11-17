/**
 * GET /api/admin/apps/[domain]/[app]/export — download the app as a qhpc-app/1 bundle
 * (details + form + parser recipe), to share or import on another portal.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getAppList } from "@/lib/apps";
import { exportApp } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";
import { parserRef } from "@/lib/parsers";
import { readRecipe } from "@/lib/parsers/site";

type Ctx = { params: Promise<{ domain: string; app: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { domain, app } = await params;
  try {
    const ref = parserRef(getAppList().appList[domain]?.[app]);
    const recipe = ref.source === "recipe" && ref.id ? readRecipe(ref.id) : undefined;
    const bundle = await exportApp(domain, app, recipe ?? undefined);
    return new NextResponse(JSON.stringify(bundle, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${domain}-${app}.qhpc-app.json"`,
      },
    });
  } catch (err) {
    return adminError(err);
  }
}
