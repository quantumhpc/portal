/**
 * HPC Queue Routes
 * GET /api/manager/queues
 */

import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { getConfig } from '@/lib/config';
import * as managers from '@/lib/hpc/managers';
import type { ManagerType } from '@/lib/hpc/managers';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hpcConfig = getHpcUserConfig(user);
    const manager = getConfig().mainConfig.manager as ManagerType;

    const data = await managers.queueList(user, manager, hpcConfig);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
