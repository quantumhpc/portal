/**
 * Alert Routes
 * GET /api/alerts?action=list|delete&alertId=
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import * as alertMethods from '@/lib/alerts';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user._id.toString();
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');

    switch (action) {
      case 'list': {
        const data = await alertMethods.getAlerts(userId);
        return NextResponse.json(data);
      }

      case 'delete': {
        const alertId = searchParams.get('alertId');
        const result = await alertMethods.deleteAlert(userId, { alertId: alertId || undefined });
        return NextResponse.json({ message: result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
