/**
 * Application logos.
 *   GET /apps/<file>  — from the site folder ($QHPC_CONFIG_DIR/apps/img) first,
 *                       then the shipped apps/img.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { appImageDirs } from "@/lib/apps";

const NAME = /^[\w.-]+\.(png|jpe?g|webp)$/i;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { file } = await params;
  if (!NAME.test(file) || file.startsWith(".")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (const dir of appImageDirs()) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    const ext = file.split(".").pop()!.toLowerCase();
    return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
      headers: {
        "Content-Type": TYPES[ext],
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
