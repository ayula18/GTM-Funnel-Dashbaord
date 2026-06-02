import { NextResponse } from 'next/server';
import { getFilterOptions } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : null;

    const options = await getFilterOptions(parsedFunnelId);
    return NextResponse.json(options);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
