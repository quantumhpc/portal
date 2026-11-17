/**
 * HPC Node Routes
 * GET /api/manager/nodes?action=list|info&nodeName=
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { getConfig } from '@/lib/config';
import * as managers from '@/lib/hpc/managers';
import type { ManagerType } from '@/lib/hpc/managers';

function hpcError(result: { ok: false; error: import('@/lib/hpc/result').AppError }, isAdmin: boolean) {
  const body: Record<string, any> = { error: result.error.message, code: result.error.code };
  if (isAdmin && result.error.detail) body.detail = result.error.detail;
  return NextResponse.json(body, { status: result.error.status ?? 500 });
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hpcConfig = getHpcUserConfig(user);
  const manager = getConfig().mainConfig.manager as ManagerType;
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');

  switch (action) {
    case 'list': {
      const result = await managers.nodeListResult(user, manager, hpcConfig);
      if (!result.ok) return hpcError(result, user.admin.isAdmin);
      return NextResponse.json(result.value);
    }

    case 'info': {
      const nodeName = searchParams.get('nodeName');
      if (!nodeName) {
        return NextResponse.json({ error: 'No nodeName provided' }, { status: 400 });
      }
      const result = await managers.nodeInfoResult(user, manager, hpcConfig, nodeName);
      if (!result.ok) return hpcError(result, user.admin.isAdmin);
      return NextResponse.json(result.value);
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
