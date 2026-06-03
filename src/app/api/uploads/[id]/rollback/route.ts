import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { rollbackBatch, getBatchFunnelId, computeDiscardReasons } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }    = await params;
    const batchId   = parseInt(id);
    if (isNaN(batchId)) {
      return NextResponse.json({ error: 'Invalid batch id' }, { status: 400 });
    }

    const funnelId = await getBatchFunnelId(batchId);
    const summary  = await rollbackBatch(batchId);

    // Funnel pass/discard state depends on the reverted fields — recompute it.
    if (funnelId) await computeDiscardReasons(funnelId);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
