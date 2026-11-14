/**
 * POST /api/admin/apps/import[?overwrite=1] — body: a qhpc-app/1 bundle.
 * Writes the app to the site folder. A bundled parser recipe is saved as
 * <domain>-<app> and attached to the app. JS parsers are never imported.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { importApp, updateMeta, validateBundle } from "@/lib/apps-admin";
import { adminError } from "@/lib/apps-route";
import { saveRecipe } from "@/lib/parsers/site";
import { compileRecipe, RecipeError, type Recipe } from "@/lib/parsers/recipe";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const bundle = validateBundle(await req.json());
    if (bundle.recipe) compileRecipe(bundle.recipe as Recipe); // validate before writing anything
    importApp(bundle, req.nextUrl.searchParams.get("overwrite") === "1");
    if (bundle.recipe) {
      const id = `${bundle.domain}-${bundle.app}`;
      saveRecipe(id, bundle.recipe as Recipe);
      updateMeta(bundle.domain, bundle.app, { parser: { source: "recipe", id } });
    } else if (bundle.meta?.parser?.source === "file") {
      updateMeta(bundle.domain, bundle.app, { parser: { source: "none" } });
    }
    return NextResponse.json({ ok: true, domain: bundle.domain, app: bundle.app }, { status: 201 });
  } catch (err) {
    if (err instanceof RecipeError) return NextResponse.json({ error: `Parser recipe: ${err.message}` }, { status: 400 });
    return adminError(err);
  }
}
