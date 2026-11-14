/**
 * Admin single user.
 *   GET    /api/admin/users/[id]
 *   PATCH  /api/admin/users/[id]            partial update
 *   DELETE /api/admin/users/[id]?hard=1     soft by default; hard wipe with flag
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { getDb, newId } from "@/lib/db/connection";
import { sanitizeUser } from "@/lib/db/models/user";
import { updateUserSchema } from "@/lib/validation/user";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const db = await getDb();
  const target = await db.collection("users").findOne({ _id: newId(id) });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(sanitizeUser(target as any));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const u = parsed.data;

  const $set: Record<string, any> = {};
  if (u.displayName !== undefined) $set["displayName"] = u.displayName;
  if (u.email      !== undefined) $set["email"]       = u.email;
  if (u.isAdmin    !== undefined) $set["admin.isAdmin"] = u.isAdmin;
  if (u.active     !== undefined) $set["admin.active"]  = u.active;

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ message: "Nothing to update" });
  }

  const db = await getDb();
  const result = await db.collection("users").findOneAndUpdate(
    { _id: newId(id) },
    { $set },
    { returnDocument: "after" }
  );
  if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await logAudit({
    actorId: (auth.user as any).id,
    actorEmail: (auth.user as any).email ?? undefined,
    action: "user.update",
    target: id,
    details: { fields: Object.keys($set) },
  });

  return NextResponse.json({ message: "User updated" });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const hard = req.nextUrl.searchParams.get("hard") === "1";
  const db = await getDb();

  if (hard) {
    const result = await db.collection("users").findOneAndDelete({ _id: newId(id) });
    if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await logAudit({
      actorId: (auth.user as any).id,
      actorEmail: (auth.user as any).email ?? undefined,
      action: "user.delete.hard",
      target: id,
      details: { username: (result as any)?.username },
    });
    return NextResponse.json({ message: `${(result as any)?.username || id} permanently deleted` });
  }

  const result = await db.collection("users").findOneAndUpdate(
    { _id: newId(id) },
    { $set: { "admin.active": false } },
    { returnDocument: "after" }
  );
  if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await logAudit({
    actorId: (auth.user as any).id,
    actorEmail: (auth.user as any).email ?? undefined,
    action: "user.deactivate",
    target: id,
  });
  return NextResponse.json({ message: "User deactivated" });
}
