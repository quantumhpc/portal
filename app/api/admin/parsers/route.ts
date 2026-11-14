/**
 * GET /api/admin/parsers — built-in parsers, plus recipes and JS drop-ins in the site folder.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { BUILTIN_PARSERS } from "@/lib/parsers";
import { listSiteParsers, siteParsersDir } from "@/lib/parsers/site";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ builtin: BUILTIN_PARSERS, site: listSiteParsers(), folder: siteParsersDir });
}
