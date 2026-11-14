/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Password management is handled by the system PAM stack; the portal does not
 * store or modify passwords.  This stub returns a clear explanation so that
 * any client that still calls this endpoint gets a useful error rather than
 * a 404 or 500.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error:
        "Password management is handled by the system (PAM). " +
        "Use your system administrator or passwd/chpasswd to change passwords.",
    },
    { status: 501 }
  );
}
