/**
 * Profile Routes
 * GET  /api/profile   – current user profile (system identity + DB admin flags)
 * POST /api/profile   – update display name / email
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/middleware";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/connection";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = getConfig();

    return NextResponse.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.admin.isAdmin,
        system: user.system,
        properties: user.properties,
      },
      pam: config.mainConfig.use_pam,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const $set: Record<string, any> = {};

    if (body.displayName !== undefined) $set["displayName"] = String(body.displayName).slice(0, 120);
    if (body.email       !== undefined) $set["email"]       = String(body.email).slice(0, 200);

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ message: "Nothing to update" });
    }

    const db = await getDb();
    await db.collection("users").updateOne(
      { username: user.username },
      { $set }
    );

    return NextResponse.json({ message: "Profile updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
