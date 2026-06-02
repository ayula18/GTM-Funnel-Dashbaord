import { NextResponse } from 'next/server';
import { mergeCompanies, computeDiscardReasons } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { primaryId, secondaryId, funnelId } = await request.json();

    if (!primaryId || !secondaryId) {
      return NextResponse.json({ error: 'primaryId and secondaryId are required' }, { status: 400 });
    }

    await mergeCompanies(primaryId, secondaryId);

    if (funnelId) {
      await computeDiscardReasons(funnelId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
