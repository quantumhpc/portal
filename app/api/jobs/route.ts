/**
 * Job Database Routes
 * GET /api/jobs?action=list|info|delete|residuals
 * Live job output: GET /api/jobs/:jobId/output/stream
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import * as jobMethods from '@/lib/db/jobs';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user._id.toString();
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const jobId = searchParams.get('jobId') || searchParams.get('jobid');

    switch (action) {
      case 'list': {
        const result = await jobMethods.getJobInfo(userId);
        return NextResponse.json(result);
      }

      case 'info': {
        if (!jobId) {
          return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
        }
        const result = await jobMethods.getJobInfo(userId, jobId);
        return NextResponse.json(result[0] || null);
      }

      case 'delete': {
        if (!jobId) {
          return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
        }
        const result = await jobMethods.deleteJobInfo(userId, jobId);
        return NextResponse.json({ message: result });
      }

      case 'residuals': {
        if (!jobId) {
          return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
        }
        const jobInfo: any = {
          jobId,
          startLine: searchParams.get('lastLine') ? Number(searchParams.get('lastLine')) : 0,
          startIter: searchParams.get('lastIter') ? Number(searchParams.get('lastIter')) : 0,
        };
        const appName = searchParams.get('appName');
        const appDomain = searchParams.get('appDomain');
        if (appName) {
          jobInfo.appName = appName;
          jobInfo.appDomain = appDomain;
        }
        const data = await jobMethods.getJobResiduals(user, jobId, jobInfo);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
