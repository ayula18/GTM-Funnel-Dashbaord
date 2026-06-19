/**
 * POST /api/upload/batch
 *
 * Receives pre-parsed CSV rows from the browser (client-side chunked upload)
 * and runs the same upsert logic as /api/upload — without touching a file.
 *
 * This bypasses Vercel's 4.5 MB serverless body limit because each batch is
 * ~500 rows of JSON (~100–200 KB), well under the limit. The browser parses
 * the full CSV, applies the column mapping, splits into chunks, and POSTs
 * each chunk here independently.
 *
 * Protocol:
 *   First chunk:  { isFirst: true,  funnelId, funnelName?, sourceType, columnMapping, fileName, rows }
 *                 → Server creates upload batch, returns { batchId, totalSeenDomains: 0 }
 *   Middle chunks:{ batchId, funnelId, sourceType, columnMapping, rows, seenDomains }
 *                 → Server processes, returns { stats, seenDomains: [...new] }
 *   Last chunk:   { batchId, funnelId, sourceType, columnMapping, rows, seenDomains, isLast: true }
 *                 → Server finalizes batch, returns complete UploadResult
 */

import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import {
  createFunnel, computeDiscardReasons, createUploadBatch, finalizeUploadBatch,
  deleteUploadBatch, ensureMatchDecisionsTable, scanForDuplicates,
} from '@/lib/db';
import { processRowBatch } from '@/lib/csv-parser';
import type { CsvSourceType, UploadResult } from '@/lib/types';
import { MAPPABLE_FIELD_SET } from '@/lib/source-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Cumulative session state ─────────────────────────────────────────────────
// We can't store server-side state across calls (serverless), so the client
// passes back the seenDomains set and running totals with each request.
// The batchId IS server-side (DB row), passed back in the first response.

interface BatchChunkRequest {
  // Routing
  funnelId: number;
  funnelName?: string;
  sourceType: CsvSourceType;
  fileName: string;

  // Column mapping: header-name → field-name (from the upload UI)
  // Also must include '__domain_col': header-name-of-domain-column
  columnMapping: Record<string, string>;
  domainHeader: string;   // the header that maps to 'domain'
  websiteHeader?: string; // the header that maps to 'website' (fallback)

  // Data — array of row objects (header → value)
  rows: Record<string, string>[];

  // State threading (client echoes these back on each subsequent call)
  batchId?: number;
  seenDomains?: string[];  // serialised Set from previous chunks

  // Lifecycle flags
  isFirst?: boolean;
  isLast?: boolean;

  // Running totals from previous chunks (client echoes back)
  prevTotals?: Partial<UploadResult>;
}

export async function POST(request: Request) {
  try {
    const body: BatchChunkRequest = await request.json();
    const {
      funnelId: funnelIdRaw, funnelName, sourceType, fileName,
      columnMapping, domainHeader, websiteHeader,
      rows, batchId: existingBatchId, seenDomains: seenDomainsArr = [],
      isFirst = false, isLast = false,
      prevTotals = {},
    } = body;

    if (!funnelIdRaw) return NextResponse.json({ error: 'funnelId required' }, { status: 400 });
    if (!rows || !Array.isArray(rows)) return NextResponse.json({ error: 'rows array required' }, { status: 400 });
    if (!sourceType) return NextResponse.json({ error: 'sourceType required' }, { status: 400 });

    // ── Resolve funnel ───────────────────────────────────────────────────────
    let funnelId = Number(funnelIdRaw);
    if (!funnelId && funnelName) {
      funnelId = await createFunnel(funnelName);
    }
    if (!funnelId) return NextResponse.json({ error: 'Invalid funnelId' }, { status: 400 });

    // ── Build index-keyed columnMapping from header-keyed map ────────────────
    // The client sends { headerName: fieldName }. processRowBatch needs
    // { columnIndex: fieldName }. The rows are objects so we use Object.keys
    // of the first row to get header order.
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const indexedMapping: Record<number, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const field = columnMapping[h];
      if (field && field !== '_skip' && MAPPABLE_FIELD_SET.has(field)) {
        indexedMapping[i] = field;
      }
    }

    // Domain / website column indices
    const domainColIdx  = domainHeader  ? headers.indexOf(domainHeader)  : -1;
    const websiteColIdx = websiteHeader ? headers.indexOf(websiteHeader) : -1;

    if (domainColIdx === -1 && websiteColIdx === -1 && isFirst) {
      return NextResponse.json({ error: 'No domain or website column found in mapping' }, { status: 400 });
    }

    // Convert row objects back to string arrays (processRowBatch uses indexed arrays)
    const rawRows: string[][] = rows.map(row => headers.map(h => row[h] ?? ''));

    // ── Batch ID: create on first call, reuse on subsequent ──────────────────
    let batchId = existingBatchId;
    if (isFirst || !batchId) {
      await ensureMatchDecisionsTable();
      batchId = await createUploadBatch({
        funnel_id:         funnelId,
        source_type:       sourceType,
        source_file:       fileName ?? null,
        mapping:           columnMapping,
        is_manual_mapping: true,
      });
    }

    // ── Reconstruct seenDomains from client echo ─────────────────────────────
    const seenDomains = new Set<string>(seenDomainsArr);

    // ── Process this chunk ───────────────────────────────────────────────────
    const chunkStats = await processRowBatch({
      rawRows,
      columnMapping: indexedMapping,
      domainColIdx:  domainColIdx  >= 0 ? domainColIdx  : undefined,
      websiteColIdx: websiteColIdx >= 0 ? websiteColIdx : undefined,
      sourceType,
      funnelId,
      batchId,
      sourceFileName: fileName,
      seenDomains,
    });

    // ── Accumulate totals ────────────────────────────────────────────────────
    const totals: Partial<UploadResult> = {
      funnel_id:          funnelId,
      source_type:        sourceType,
      batch_id:           batchId,
      total_rows:         (prevTotals.total_rows          || 0) + chunkStats.total_rows,
      new_companies:      (prevTotals.new_companies       || 0) + chunkStats.new_companies,
      matched_companies:  (prevTotals.matched_companies   || 0) + chunkStats.matched_companies,
      updated_companies:  (prevTotals.updated_companies   || 0) + chunkStats.updated_companies,
      duplicates_skipped: (prevTotals.duplicates_skipped  || 0) + chunkStats.duplicates_skipped,
      domain_conflicts:   (prevTotals.domain_conflicts    || 0) + chunkStats.domain_conflicts,
      fields_updated:     { ...(prevTotals.fields_updated || {}) },
      skipped_fields:     { ...(prevTotals.skipped_fields || {}) },
      errors:             [...(prevTotals.errors           || []), ...chunkStats.errors],
      funnel_name:        funnelName ?? '',
    };
    for (const [f, c] of Object.entries(chunkStats.fields_updated))
      (totals.fields_updated as Record<string, number>)[f] = ((totals.fields_updated as Record<string, number>)[f] || 0) + c;
    for (const [f, c] of Object.entries(chunkStats.skipped_fields))
      (totals.skipped_fields as Record<string, number>)[f] = ((totals.skipped_fields as Record<string, number>)[f] || 0) + c;

    // ── Finalize on last chunk ────────────────────────────────────────────────
    if (isLast) {
      if ((totals.total_rows || 0) === 0 && Object.keys(totals.fields_updated || {}).length === 0) {
        await deleteUploadBatch(batchId);
        totals.batch_id = undefined;
      } else {
        await finalizeUploadBatch(batchId, {
          total_rows:        totals.total_rows        || 0,
          new_companies:     totals.new_companies     || 0,
          matched_companies: totals.matched_companies || 0,
          fields_updated:    totals.fields_updated    || {},
          skipped_fields:    totals.skipped_fields    || {},
        });
      }

      // Post-import duplicate scan
      try {
        const dupsFound = await scanForDuplicates(funnelId);
        if (dupsFound > 0) totals.domain_conflicts = (totals.domain_conflicts || 0) + dupsFound;
      } catch { /* non-fatal */ }

      await computeDiscardReasons(funnelId);
    }

    return NextResponse.json({
      done:        isLast,
      batchId,
      seenDomains: Array.from(seenDomains),  // echoed back to client for next chunk
      chunkStats,
      totals,
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
