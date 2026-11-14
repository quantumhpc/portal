import { NextResponse } from "next/server";
import { AppAdminError } from "./apps-admin";
import { log } from "./log";

/** JSON error response for admin app/parser routes. */
export function adminError(err: unknown) {
  if (err instanceof AppAdminError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  log.error({ err }, "Admin applications request failed");
  return NextResponse.json({ error: (err as Error)?.message || "Request failed" }, { status: 500 });
}
