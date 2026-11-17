/**
 * File Download Route
 * GET /api/data/download?file=path
 * GET /api/data/download?file=path&exists=1 (check existence)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { fileExists, getDownloadInfo } from '@/lib/files/datajs';
import path from 'path';
import { streamAsUser } from '@/lib/files/as-user';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const file = searchParams.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file specified' }, { status: 400 });
    }

    // Existence check
    if (searchParams.get('exists')) {
      return NextResponse.json(fileExists(user, file));
    }

    const info = getDownloadInfo(user, file);

    const name = path.basename(file);
    if (info.isDirectory) {
      // tar runs as the user, so it only packs what the user can read.
      return new NextResponse(streamAsUser(user.system, 'tar', ['-cf', '-', '-C', file, '.']), {
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Disposition': `attachment; filename="${name}.tar"`,
        },
      });
    }

    return new NextResponse(streamAsUser(user.system, 'cat', ['--', file]), {
      headers: {
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
