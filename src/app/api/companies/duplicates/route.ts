import { NextRequest, NextResponse } from 'next/server';
import { getMergeCandidates, resolveMergeCandidate, scanForDuplicates, getPendingMergeCandidateCount } from '@/lib/db';

/**
 * GET /api/companies/duplicates — List pending merge candidates
 * Query params: funnel_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get('funnel_id');

    const candidates = await getMergeCandidates(funnelId ? parseInt(funnelId) : undefined);
    const count      = await getPendingMergeCandidateCount(funnelId ? parseInt(funnelId) : undefined);

    return NextResponse.json({ candidates, count });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/companies/duplicates — Resolve a merge candidate or trigger scan
 * Body: { action: 'approve' | 'reject', id: number }
 *   OR: { action: 'scan', funnel_id: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'scan') {
      if (!body.funnel_id) {
        return NextResponse.json({ error: 'funnel_id required for scan' }, { status: 400 });
      }
      const found = await scanForDuplicates(body.funnel_id);
      return NextResponse.json({ scanned: true, duplicates_found: found });
    }

    if (!body.id || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { error: 'Required: id (number), action ("approve" | "reject")' },
        { status: 400 },
      );
    }

    const result = await resolveMergeCandidate(body.id, body.action);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
