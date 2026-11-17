/**
 * Job Link Route
 * POST /api/jobs/link - Link an external HPC job to the portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import * as jobMethods from '@/lib/db/jobs';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const jobId = body.jobId || body.jobid;
    if (!jobId) {
      return NextResponse.json({ error: 'No jobId provided' }, { status: 400 });
    }

    // Extract selected files from body (files[key] = path)
    const selectedFiles: Record<string, string> = {};
    for (const key in body) {
      const m = key.match(/^files\[(.+?)\]$/);
      if (m && body[key] !== 'skip') {
        selectedFiles[m[1]] = body[key];
      }
    }

    // Also support a direct selectedFiles object
    if (body.selectedFiles && typeof body.selectedFiles === 'object') {
      Object.assign(selectedFiles, body.selectedFiles);
    }

    const result = await jobMethods.jobLink(
      user,
      body.jobWorkingDir,
      jobId,
      body.appDomain,
      body.appName,
      selectedFiles
    );

    return NextResponse.json({ message: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
