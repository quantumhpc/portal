/**
 * Browser remote-desktop session of one of the user's remote jobs.
 * GET /api/vnc/:jobId → { ready: true, url, password } | { ready: false, reason }
 *
 * Owner only. The password is the job's one-time VNC password; noVNC needs it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getVncSession } from '@/lib/vnc/session';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  try {
    const session = await getVncSession(user, jobId);
    if (!session) return NextResponse.json({ error: 'No such remote session' }, { status: 404 });
    return NextResponse.json(session, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    log.error({ err, jobId }, 'VNC session setup failed');
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
