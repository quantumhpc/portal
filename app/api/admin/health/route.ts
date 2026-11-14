/**
 * GET /api/admin/health            health checks (JSON)
 * GET /api/admin/health?bundle=1   support bundle: checks, versions, config with secrets removed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/auth/middleware';
import { runHealthChecks, supportBundle } from '@/lib/health';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!req.nextUrl.searchParams.get('bundle')) {
    return NextResponse.json(await runHealthChecks(user));
  }

  const bundle = await supportBundle(user);
  await logAudit({ actorId: user._id.toString(), action: 'support.bundle' });
  const stamp = bundle.generatedAt.slice(0, 19).replace(/[:T]/g, '-');
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="qhpc-support-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
