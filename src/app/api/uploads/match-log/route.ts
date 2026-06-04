import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getMatchDecisions, getMatchDecisionSummary, ensureMatchDecisionsTable } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await ensureMatchDecisionsTable();

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch_id');
    const view = searchParams.get('view') || 'decisions'; // decisions | summary

    if (!batchId) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
    }

    const id = parseInt(batchId);

    if (view === 'summary') {
      const summary = await getMatchDecisionSummary(id);
      return NextResponse.json({ summary });
    }

    const method = searchParams.get('method') || undefined;
    const search = searchParams.get('search') || undefined;

    const decisions = await getMatchDecisions(id, { method, search });
    return NextResponse.json({ decisions });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
