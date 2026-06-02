import { NextResponse } from 'next/server';
import { updateFunnelClassification } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }

    // Set status to stopping, keeping other fields as-is
    // Wait, updateFunnelClassification requires 5 arguments.
    // Instead of doing a full update, we can just do a partial update.
    // Actually, setting classification_status = 'stopping' is enough.
    // I will write a simple query.
    const { qdb, computeDiscardReasons } = await import('@/lib/db');
    await qdb('UPDATE funnels SET classification_status = $1 WHERE id = $2', ['idle', funnel_id]);

    // Partial classification still changed decisions — refresh drop-off reasons.
    try { await computeDiscardReasons(Number(funnel_id)); } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
