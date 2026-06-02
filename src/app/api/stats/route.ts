import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : undefined;

    const stats = await getDashboardStats(parsedFunnelId);
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
