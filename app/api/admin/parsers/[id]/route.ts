/**
 * Parser recipes ($QHPC_CONFIG_DIR/apps/parsers/<id>.json).
 *   GET    /api/admin/parsers/[id]
 *   PUT    /api/admin/parsers/[id]   body: Recipe (patterns are compiled before saving)
 *   DELETE /api/admin/parsers/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { deleteRecipe, readRecipe, saveRecipe, ParserFileError } from "@/lib/parsers/site";
import { RecipeError } from "@/lib/parsers/recipe";

type Ctx = { params: Promise<{ id: string }> };

function fail(err: unknown) {
  const status = err instanceof RecipeError || err instanceof ParserFileError || err instanceof SyntaxError ? 400 : 500;
  return NextResponse.json({ error: (err as Error).message }, { status });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const recipe = readRecipe(id);
    return recipe ? NextResponse.json(recipe) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    saveRecipe(id, await req.json());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    deleteRecipe(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
