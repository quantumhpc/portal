/**
 * App Info Route
 * GET /api/info - Returns app list, manager config, version info
 * GET /api/info?appform=1&domain=x&name=y&type=z - Returns app form template
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { getConfig } from '@/lib/config';
import { getAppList, getAppForm, reloadApps } from '@/lib/apps';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const config = getConfig();

    // App form template request
    if (searchParams.get('appform')) {
      const domain = searchParams.get('domain');
      const name = searchParams.get('name');
      if (!domain || !name) {
        return NextResponse.json({ error: 'Missing domain or name' }, { status: 400 });
      }
      const form = await getAppForm(domain, name);
      return NextResponse.json(form);
    }

    // Reload app list (admin only)
    if (searchParams.get('reload')) {
      if (!user.admin?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      reloadApps();
      return NextResponse.json({ message: 'Apps reloaded' });
    }

    // Default: return app list and config info
    const apps = getAppList();
    let hpcUserConfig;
    try {
      hpcUserConfig = getHpcUserConfig(user);
    } catch {
      hpcUserConfig = {};
    }

    return NextResponse.json({
      appList: apps.appList,
      appsBatch: apps.appsBatch,
      appsRemote: apps.appsRemote,
      appsJson: apps.appsJson,
      appTags: apps.appTags,
      manager: config.mainConfig.manager,
      hpcUserConfig,
      release: config.properties.version,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
