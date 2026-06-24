/**
 * GET /api/upload/batch/resume?batchId=X
 *
 * Returns everything needed to reconstruct the upload resume state:
 *   - seenDomains: all input_domain values already committed (from match_decisions)
 *   - chunksDone:  how many chunks the server has confirmed
 *   - chunksTotal: total chunks in the file
 *   - prevTotals:  running totals at the last checkpoint
 *
 * The client uses this to skip already-processed chunks and reconstruct the
 * dedup set without having to persist it in the browser.
 */

import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';
import { getSeenDomainsForBatch } from '@/lib/db/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchIdStr = searchParams.get('batchId');

    if (!batchIdStr) {
      return NextResponse.json({ error: 'batchId query parameter is required' }, { status: 400 });
    }

    const batchId = parseInt(batchIdStr, 10);
    if (isNaN(batchId)) {
      return NextResponse.json({ error: 'batchId must be a number' }, { status: 400 });
    }

    // Fetch batch metadata
    const batches = await qp<{
      id: number;
      funnel_id: number;
      source_type: string;
      source_file: string | null;
      status: string;
      total_rows: number;
      new_companies: number;
      matched_companies: number;
      updated_companies: number;
      duplicates_skipped: number;
      fields_updated: Record<string, number> | null;
      skipped_fields: Record<string, number> | null;
      chunks_total: number;
      chunks_done: number;
      total_file_rows: number;
    }>(
      `SELECT id, funnel_id, source_type, source_file, status,
              total_rows, new_companies, matched_companies,
              COALESCE(chunks_total, 0)    AS chunks_total,
              COALESCE(chunks_done, 0)     AS chunks_done,
              COALESCE(total_file_rows, 0) AS total_file_rows,
              fields_updated, skipped_fields
         FROM upload_batches WHERE id = $1`,
      [batchId],
    );

    if (batches.length === 0) {
      return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 });
    }

    const batch = batches[0];

    if (batch.status === 'rolled_back') {
      return NextResponse.json({ error: 'This upload has been rolled back and cannot be resumed' }, { status: 409 });
    }

    // Reconstruct seenDomains from match_decisions
    const seenDomains = await getSeenDomainsForBatch(batchId);

    // Reconstruct prevTotals from the batch row
    const prevTotals = {
      funnel_id:          batch.funnel_id,
      source_type:        batch.source_type,
      batch_id:           batchId,
      total_rows:         batch.total_rows         ?? 0,
      new_companies:      batch.new_companies      ?? 0,
      matched_companies:  batch.matched_companies  ?? 0,
      updated_companies:  0,
      duplicates_skipped: Math.max(0, (batch.total_rows ?? 0) - (batch.new_companies ?? 0) - (batch.matched_companies ?? 0)),
      domain_conflicts:   0,
      fields_updated:     batch.fields_updated  ?? {},
      skipped_fields:     batch.skipped_fields  ?? {},
      errors:             [],
    };

    return NextResponse.json({
      batchId,
      funnelId:     batch.funnel_id,
      seenDomains,
      chunksDone:   batch.chunks_done,
      chunksTotal:  batch.chunks_total,
      prevTotals,
    });
  } catch (error) {
    console.error('Resume endpoint error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
