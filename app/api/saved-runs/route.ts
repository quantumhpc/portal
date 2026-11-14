/**
 * Saved runs of the logged-in user.
 * GET    /api/saved-runs            list
 * GET    /api/saved-runs?id=<id>    one
 * POST   /api/saved-runs            { name, appDomain, appName, type, jobArgs }
 * DELETE /api/saved-runs?id=<id>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getAppList } from '@/lib/apps';
import { deleteSavedRun, getSavedRun, listSavedRuns, saveRun, SavedRunError } from '@/lib/db/saved-runs';

const notFound = () => NextResponse.json({ error: 'Saved set-up not found' }, { status: 404 });

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json(await listSavedRuns(user._id.toString()));
  return (await getSavedRun(user._id.toString(), id).then((r) => r && NextResponse.json(r))) ?? notFound();
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  if (!getAppList().appList?.[body.appDomain]?.[body.appName]) {
    return NextResponse.json({ error: 'Unknown application' }, { status: 400 });
  }
  try {
    return NextResponse.json(await saveRun(user._id.toString(), body), { status: 201 });
  } catch (err) {
    if (err instanceof SavedRunError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  return (await deleteSavedRun(user._id.toString(), id)) ? NextResponse.json({ ok: true }) : notFound();
}
