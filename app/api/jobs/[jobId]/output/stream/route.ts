/**
 * Job Output Stream (Server-Sent Events)
 * GET /api/jobs/:jobId/output/stream
 *
 * Sends the last 64 KB of the job's output file, then new bytes as they are
 * written, until the job reaches a terminal state. Reads run as the user.
 * On reconnect the browser sends Last-Event-ID (a byte offset) and the stream
 * resumes there.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getJobInfo } from '@/lib/db/jobs';
import { tailStream } from '@/lib/files/tail';
import { isTerminal } from '@/lib/hpc/status';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const userId = user._id.toString();
  const [job] = await getJobInfo(userId, jobId);
  const file: string | undefined = job?.jobInfo?.output?.outputFile;
  if (!file) {
    return NextResponse.json({ error: 'No output has been defined.' }, { status: 404 });
  }

  const lastId = Number(req.headers.get('last-event-id'));
  const offset = Number.isInteger(lastId) && lastId >= 0 && req.headers.has('last-event-id') ? lastId : undefined;

  const body = tailStream({
    user: user.system,
    file,
    offset,
    signal: req.signal,
    isDone: async () => {
      const [current] = await getJobInfo(userId, jobId);
      return isTerminal(current?.server?.status);
    },
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: don't buffer the stream
    },
  });
}
