/**
 * File Resource Route
 * GET /api/data/resource?resource=path&from=0&display=1
 * POST /api/data/resource { resource, content, from?, to? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getContent, getRawContent, writeContent } from '@/lib/files/datajs';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const resource = searchParams.get('resource');
    if (!resource) {
      return NextResponse.json({ error: 'No resource specified' }, { status: 400 });
    }

    const partials: any = {};
    if (searchParams.get('from')) partials.from = Number(searchParams.get('from'));

    const result = getContent(user, resource, Object.keys(partials).length > 0 ? partials : undefined);

    // Handle raw (binary/image) files
    if ('raw' in result && result.raw) {
      if (searchParams.get('display')) {
        const fileBuffer = new Uint8Array(getRawContent(user, resource));
        return new NextResponse(fileBuffer, {
          headers: { 'Content-Type': (result as any).mimetype },
        });
      }
      return new NextResponse('', {
        headers: { 'Content-Type': (result as any).mimetype },
      });
    }

    return NextResponse.json(result);
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

    const body = await req.json();
    if (!body.resource) {
      return NextResponse.json({ error: 'No resource specified' }, { status: 400 });
    }

    const partials: any = {};
    if (body.from !== undefined && body.to !== undefined) {
      partials.from = Number(body.from);
      partials.to = Number(body.to);
    }

    writeContent(user, body.resource, body.content, Object.keys(partials).length > 0 ? partials : undefined);
    return NextResponse.json({ message: 'File successfully written' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
