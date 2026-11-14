/**
 * File Operations Route
 * POST /api/data/operations { action, ... }
 *   action=mkdir: { directory, name }
 *   action=delete: { file, force? }
 *   action=copy: { file, to }
 *   action=move: { file, to }
 *   action=rename: { file, to }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { createDirectory, deleteFile, moveFile, renameFile } from '@/lib/files/datajs';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'mkdir': {
        if (!body.directory || !body.name) {
          return NextResponse.json({ error: 'Missing directory or name' }, { status: 400 });
        }
        const folder = createDirectory(user, body.directory, body.name);
        return NextResponse.json({ message: 'Folder successfully created', folder });
      }

      case 'delete': {
        if (!body.file) {
          return NextResponse.json({ error: 'Missing file' }, { status: 400 });
        }
        deleteFile(user, body.file, body.force === true);
        return NextResponse.json({ message: `${body.file} successfully deleted` });
      }

      case 'copy': {
        if (!body.file || !body.to) {
          return NextResponse.json({ error: 'Missing file or destination' }, { status: 400 });
        }
        moveFile(user, body.file, body.to, false);
        return NextResponse.json({ message: `File successfully copied to ${body.to}` });
      }

      case 'move': {
        if (!body.file || !body.to) {
          return NextResponse.json({ error: 'Missing file or destination' }, { status: 400 });
        }
        moveFile(user, body.file, body.to, true);
        return NextResponse.json({ message: `File successfully moved to ${body.to}` });
      }

      case 'rename': {
        if (!body.file || !body.to) {
          return NextResponse.json({ error: 'Missing file or new name' }, { status: 400 });
        }
        const newPath = renameFile(user, body.file, body.to);
        return NextResponse.json({ message: 'File successfully renamed', path: newPath });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
