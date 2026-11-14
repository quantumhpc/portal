/**
 * Resumable upload endpoint (tus protocol).
 * POST /api/data/tus          create an upload (metadata: filename, destination)
 * HEAD/PATCH/DELETE /api/data/tus/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { currentUser, getTusServer } from '@/lib/files/upload';

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return currentUser.run(user, () => getTusServer().handleWeb(req));
}

export { handle as POST, handle as HEAD, handle as PATCH, handle as DELETE, handle as OPTIONS };
