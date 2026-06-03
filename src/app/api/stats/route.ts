import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getDashboardStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : undefined;

    const stats = await getDashboardStats(parsedFunnelId);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
