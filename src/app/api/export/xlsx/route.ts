import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { buildFunnelWorkbook } from '@/lib/xlsx-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const funnelId = new URL(request.url).searchParams.get('funnel_id');
    if (!funnelId) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 });
    }

    const { buffer, funnelName } = await buildFunnelWorkbook(parseInt(funnelId));
    const date = new Date().toISOString().split('T')[0];
    const safeName = funnelName.replace(/[^\w\- ]+/g, '').trim() || 'Funnel';
    const fileName = `${safeName} ${date}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
