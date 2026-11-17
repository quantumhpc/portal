import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/connection";
import type { AuthenticatedUser, UserDocument } from "@/lib/db/models/user";
import { requestStore } from "@/lib/log";

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireAdmin() {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session.user as any).isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

/**
 * Build an AuthenticatedUser from the session JWT — no DB round-trip for
 * normal requests. System identity (uid/gid/home) was resolved at login and
 * stored in the token.
 * Also seeds the AsyncLocalStorage request context for structured logging.
 */
export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  // Stamp a reqId on the current async context if not already present.
  if (!requestStore.getStore()) {
    return requestStore.run({ reqId: crypto.randomUUID() }, () => getAuthUser());
  }

  const session = await getAuthSession();
  if (!session?.user) return null;

  const u = session.user as any;
  if (!u.id || !u.username) return null;

  return {
    _id: u.id,
    username: u.username,
    displayName: u.name || u.username,
    email: u.email || undefined,
    admin: {
      isAdmin: u.isAdmin ?? false,
      active: true,
    },
    system: {
      username: u.username,
      uid: u.uid ?? 0,
      gid: u.gid ?? 0,
      home: u.home ?? `/home/${u.username}`,
      shell: u.shell ?? "/bin/sh",
    },
  };
}

/**
 * Fetch the full DB record for the current user. Use only when you need
 * mutable admin fields (e.g. admin pages, profile editing).
 */
export async function getDbUser(): Promise<UserDocument | null> {
  const session = await getAuthSession();
  if (!session?.user) return null;

  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ username: (session.user as any).username });
  return user as UserDocument | null;
}
