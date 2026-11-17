/**
 * HPC Job Submission Route
 * POST /api/manager/submit
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { getConfig } from '@/lib/config';
import * as managers from '@/lib/hpc/managers';
import type { ManagerType } from '@/lib/hpc/managers';

function booleanize(body: Record<string, any>): Record<string, any> {
  for (const field in body) {
    if (body[field] === 'true') body[field] = true;
    else if (body[field] === 'false') body[field] = false;
  }
  return body;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hpcConfig = getHpcUserConfig(user);
    const manager = getConfig().mainConfig.manager as ManagerType;
    const body = await req.json();
    const jobArgs = booleanize(body);

    const data = await managers.submitJob(user, manager, hpcConfig, jobArgs);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
