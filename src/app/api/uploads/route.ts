export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { listUploadBatches } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get('funnel_id');
    if (!funnelId) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 });
    }
    const batches = await listUploadBatches(parseInt(funnelId));
    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
