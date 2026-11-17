/**
 * Directory Tree Route
 * GET /api/data/tree?folder=personal|working&id=1|nodeId&windex=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getConfig, getDirs } from '@/lib/config';
import { getTree } from '@/lib/files/datajs';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const folder = searchParams.get('folder') || 'personal';
    const id = searchParams.get('id');
    const subfolder = searchParams.get('subfolder') || undefined;
    const windex = searchParams.get('windex');

    let folderTree: string | undefined;
    let rootName: string;

    switch (folder) {
      case 'personal':
      case 'personnal': // legacy spelling, kept for old links
        folderTree = user.system?.home;
        rootName = 'Home';
        break;

      case 'working': {
        const config = getConfig();
        const hpcConfig = config.hpcGlobalConfig;
        if (hpcConfig.useSharedDir) {
          const dirs = getDirs(hpcConfig, windex ? Number(windex) : undefined);
          folderTree = dirs.sharedDir;
          rootName = 'Working Directory';
        } else {
          return NextResponse.json({ error: 'Not implemented yet' }, { status: 500 });
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown folder type: ${folder}` }, { status: 400 });
    }

    if (!folderTree) {
      return NextResponse.json({ error: `${rootName!} folder is not defined` }, { status: 500 });
    }

    const tree = getTree(user, folderTree, id, rootName, { folder: subfolder });
    return NextResponse.json(tree);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
