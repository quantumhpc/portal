/**
 * HPC Manager Job Routes
 * GET /api/manager/jobs?action=list|info|full|move|files|cancel|hold|release|run|rerun|delete
 * POST /api/manager/jobs { action: "retrieve" | "alter", ... }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { getConfig } from '@/lib/config';
import * as managers from '@/lib/hpc/managers';
import type { ManagerType } from '@/lib/hpc/managers';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hpcConfig = getHpcUserConfig(user);
    const manager = getConfig().mainConfig.manager as ManagerType;
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const jobId = searchParams.get('jobId') || searchParams.get('jobid');

    if (action === 'list') {
      const result = await managers.jobListResult(user, manager, hpcConfig);
      if (!result.ok) {
        const body: Record<string, any> = { error: result.error.message, code: result.error.code };
        if (user.admin.isAdmin && result.error.detail) body.detail = result.error.detail;
        return NextResponse.json(body, { status: result.error.status ?? 500 });
      }
      return NextResponse.json(result.value);
    }

    if (!jobId) {
      return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
    }

    switch (action) {
      case 'full':
      case 'info': {
        const data = await managers.jobInfo(user, manager, hpcConfig, jobId);
        return NextResponse.json(data);
      }

      case 'move': {
        const destination = searchParams.get('destination');
        if (!destination) {
          return NextResponse.json({ error: 'No destination provided' }, { status: 400 });
        }
        const data = await managers.jobMove(user, manager, hpcConfig, jobId, destination);
        return NextResponse.json({ message: data.message });
      }

      case 'files': {
        const data = await managers.jobFiles(user, manager, hpcConfig, jobId);
        return NextResponse.json(data);
      }

      case 'cancel':
      case 'delete':
      case 'hold':
      case 'release':
      case 'run':
      case 'rerun': {
        const data = await managers.jobAction(user, manager, hpcConfig, jobId, action);
        return NextResponse.json({ message: data.message });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
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

    const jobId = body.jobId || body.jobid;
    if (!jobId) {
      return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
    }

    if (body.action === 'alter') {
      // Alter job (rename, change priority)
      const jobArgs: any = {};
      if (body.jobName) jobArgs.jobName = body.jobName;
      if (body.priority !== undefined) jobArgs.priority = body.priority;
      const data = await managers.alterJob(user, manager, hpcConfig, jobId, jobArgs);
      return NextResponse.json(data);
    }

    // Default: retrieve job files
    const data = await managers.jobRetrieve(
      user, manager, hpcConfig,
      jobId, body.jobFiles || [], body.destination
    );
    return NextResponse.json({ message: data.message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
