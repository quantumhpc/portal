/**
 * POST /api/admin/parsers/test — run a parser on a log sample, for the admin test pane.
 * Body: { recipe } or { ref: { source: "builtin"|"file", id } }, plus
 *       { sample: "<log text>" } or { path: "/abs/file" } (read as the admin's own OS user).
 * Returns the ParserResult; recipes also return matchedLines.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/auth/middleware";
import { asUser } from "@/lib/files/as-user";
import { runRecipe, RecipeError } from "@/lib/parsers/recipe";
import { getParserEntry } from "@/lib/parsers";
import { loadFileParser, ParserFileError } from "@/lib/parsers/site";
import type { ParserResult } from "@/lib/parsers/types";

const MAX_SAMPLE = 2 * 1000 * 1000;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    let text: string;
    if (typeof body.path === "string" && body.path) {
      const user = await getAuthUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const read = asUser(user.system, "read", body.path, "utf8", MAX_SAMPLE);
      if (read.tooBig) return NextResponse.json({ error: "File is larger than 2 MB; paste an excerpt instead" }, { status: 400 });
      text = read.data ?? "";
    } else {
      text = String(body.sample ?? "").slice(0, MAX_SAMPLE);
    }

    if (body.recipe) return NextResponse.json(runRecipe(body.recipe, text));

    const ref = body.ref ?? {};
    const entry = ref.source === "file" ? loadFileParser(String(ref.id)) : getParserEntry(String(ref.id));
    if (!entry?.post) return NextResponse.json({ error: "This parser has no output parser" }, { status: 400 });
    const result = await new Promise<ParserResult>((resolve, reject) =>
      entry.post!(text, 0, 0, {}, (err, data) => (err ? reject(err) : resolve(data))),
    );
    return NextResponse.json(result);
  } catch (err) {
    const known = err instanceof RecipeError || err instanceof ParserFileError || (err as any)?.code;
    return NextResponse.json({ error: (err as Error).message }, { status: known ? 400 : 500 });
  }
}
