/**
 * Reverse-proxy check before a remote-desktop WebSocket is forwarded to websockify.
 * GET /api/vnc/authorize → 204 if the session user owns the token, else 401/403.
 *
 * nginx: `auth_request /api/vnc/authorize;` with
 * `proxy_set_header X-Original-URI $request_uri;` (the token is in that URI's query).
 * Direct calls may pass `?token=` instead. See docs/remote-desktop.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { authorizeToken } from '@/lib/vnc/session';

export const dynamic = 'force-dynamic';

function tokenOf(req: NextRequest): string {
  const original = req.headers.get('x-original-uri');
  if (original) {
    try {
      return new URL(original, 'http://x').searchParams.get('token') ?? '';
    } catch {
      return '';
    }
  }
  return req.nextUrl.searchParams.get('token') ?? '';
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const ok = await authorizeToken(user._id.toString(), tokenOf(req));
  return new NextResponse(null, { status: ok ? 204 : 403, headers: { 'Cache-Control': 'no-store' } });
}
