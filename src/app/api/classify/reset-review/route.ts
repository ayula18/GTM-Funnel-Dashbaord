export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { resetReviewCompanies } from '@/lib/db';

/**
 * POST /api/classify/reset-review
 *
 * Puts all "Review" companies back into the unclassified queue so they can
 * be re-classified with the latest LLM prompt and source detection logic.
 * Scrape cache is cleared only for previously failed/dead-domain companies —
 * successful cached scrapes are reused to avoid unnecessary credit spend.
 */
export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }
    const count = await resetReviewCompanies(funnel_id);
    return NextResponse.json({ reset: count });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
