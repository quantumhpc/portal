/**
 * License Manager Route
 * GET /api/license?id=1 - Get configured license servers
 * GET /api/license?feature=name - Get license pool status for a feature
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { lmstat, getLicServers } from '@/lib/license-managers';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;

    // Return license server configuration
    if (searchParams.get('id') === '1') {
      return NextResponse.json(getLicServers());
    }

    // Query a specific license feature/server
    const feature = searchParams.get('feature');
    if (!feature) {
      return NextResponse.json({ error: 'No feature specified' }, { status: 400 });
    }

    const licServers = getLicServers();
    const serverConfig = licServers[feature];
    if (!serverConfig) {
      return NextResponse.json({ error: 'Cannot find the specified feature' }, { status: 404 });
    }

    let data: Record<string, any>;
    try {
      data = lmstat(serverConfig);
    } catch (err: any) {
      // The license server (or its configured test fixture) may be unreachable.
      // That's an operational condition, not a portal failure — return a graceful
      // error payload (HTTP 200) so the UI can render an empty/error state instead
      // of surfacing a 500 for every feature.
      return NextResponse.json({ error: `Unable to query license server: ${err.message}` });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
