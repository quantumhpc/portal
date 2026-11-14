/**
 * Admin user list / create.
 *   GET  /api/admin/users
 *   GET  /api/admin/users?osusers=1    list OS users
 *   GET  /api/admin/users?getent=user  resolve one OS user
 *   POST /api/admin/users              create/pre-authorise a user record
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/connection";
import { getDefaultUser, sanitizeUser } from "@/lib/db/models/user";
import { createUserSchema } from "@/lib/validation/user";
import { logAudit } from "@/lib/audit";
import { osUsers, getent } from "@/lib/os";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;

  if (searchParams.get("osusers")) {
    return NextResponse.json(osUsers());
  }
  if (searchParams.get("getent")) {
    const username = searchParams.get("getent");
    if (!username) return NextResponse.json({ error: "No username" }, { status: 400 });
    return NextResponse.json(getent(username));
  }

  const db = await getDb();
  const list = await db.collection("users").find({}).toArray();
  return NextResponse.json(list.map((u: any) => sanitizeUser(u)));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const db = await getDb();
  const existing = await db.collection("users").findOne({ username: input.username });
  if (existing) {
    return NextResponse.json({ error: "User record already exists" }, { status: 409 });
  }

  const newUser = {
    ...getDefaultUser(input.username),
    displayName: input.displayName,
    email: input.email,
    admin: {
      isAdmin: input.isAdmin ?? false,
      active: input.active ?? true,
    },
  };

  const result = await db.collection("users").insertOne(newUser);
  await logAudit({
    actorId: (auth.user as any).id,
    actorEmail: (auth.user as any).email ?? undefined,
    action: "user.create",
    target: String(result.insertedId),
    details: { username: input.username, isAdmin: input.isAdmin },
  });

  return NextResponse.json({ _id: result.insertedId, username: input.username });
}
