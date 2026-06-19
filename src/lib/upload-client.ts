import type { UploadResult, CsvSourceType } from './types';
import Papa from 'papaparse';
import { autoMapField } from './csv-detect';

export interface UploadProgress {
  processed: number;
  total: number;
  pct: number;
  finalizing?: boolean;
  phase?: string;
}

// ─── Small-file path (≤ CHUNK_THRESHOLD) ─────────────────────────────────────
// Sends the raw file as FormData to /api/upload and streams NDJSON progress.
// Used only for files under the threshold (safe margin below Vercel's 4.5 MB).

const CHUNK_THRESHOLD_BYTES = 3.5 * 1024 * 1024; // 3.5 MB
const ROWS_PER_CHUNK        = 500;

/**
 * POST a CSV to /api/upload and stream live progress.
 *
 * The companies endpoint responds with NDJSON ({type:"progress"} lines, then a
 * final {type:"done"|"error"}). This reader surfaces progress via `onProgress`
 * and resolves with the final UploadResult. Non-streaming responses (validation
 * errors, the master-list path) are handled as plain JSON.
 */
export async function uploadCsv(
  formData: FormData,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const ct = res.headers.get('content-type') || '';

  if (!ct.includes('ndjson') || !res.body) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data as UploadResult;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: UploadResult | null = null;
  let errorMsg: string | null = null;

  const handle = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(trimmed); } catch { return false; }

    if (msg.type === 'progress') {
      const total = (msg.total as number) || 0;
      const processed = (msg.processed as number) || 0;
      onProgress?.({
        processed,
        total,
        pct: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
        finalizing: msg.phase === 'finalizing',
      });
      return false;
    } else if (msg.type === 'done') {
      result = msg.result as UploadResult;
      return true;
    } else if (msg.type === 'error') {
      errorMsg = (msg.error as string) || 'Upload failed';
      return true;
    }
    return false;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    let shouldBreak = false;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      if (handle(buffer.slice(0, nl))) {
        shouldBreak = true;
        break;
      }
      buffer = buffer.slice(nl + 1);
    }
    if (shouldBreak) break;
  }
  if (buffer) handle(buffer);

  if (errorMsg) throw new Error(errorMsg);
  if (!result) throw new Error('Upload ended unexpectedly without a result');
  return result;
}

// ─── Chunked path (> CHUNK_THRESHOLD) ────────────────────────────────────────
// PapaParse reads the CSV entirely in the browser (no size limit — it's local),
// builds the row objects using the resolved column mapping, splits into
// ROWS_PER_CHUNK batches, and POSTs each to /api/upload/batch. Each request is
// ~100–200 KB JSON — far below the 4.5 MB Vercel limit. The seenDomains set
// is echoed back from the server so deduplication spans the whole file.

export interface ChunkedUploadOptions {
  file: File;
  funnelId: number;
  funnelName?: string;
  sourceType: CsvSourceType;
  /** header → field mapping from the upload UI */
  columnMapping: Record<string, string>;
  /** the header name whose values are domains (or websites) */
  domainHeader: string;
  websiteHeader?: string;
  onProgress?: (p: UploadProgress) => void;
}

export async function uploadCsvChunked(opts: ChunkedUploadOptions): Promise<UploadResult> {
  const { file, funnelId, funnelName, sourceType, columnMapping, domainHeader, websiteHeader, onProgress } = opts;

  // ── 1. Parse entire CSV in the browser ──────────────────────────────────
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header:         true,
    skipEmptyLines: true,
    dynamicTyping:  false,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }

  const allRows = parsed.data;
  const totalRows = allRows.length;

  if (totalRows === 0) throw new Error('CSV has no data rows');

  onProgress?.({ processed: 0, total: totalRows, pct: 0, phase: 'parsing' });

  // ── 2. Split into chunks ─────────────────────────────────────────────────
  const chunks: Record<string, string>[][] = [];
  for (let i = 0; i < totalRows; i += ROWS_PER_CHUNK) {
    chunks.push(allRows.slice(i, i + ROWS_PER_CHUNK));
  }

  // ── 3. POST each chunk sequentially ─────────────────────────────────────
  let batchId: number | undefined;
  let seenDomains: string[] = [];
  let prevTotals: Partial<UploadResult> = {};
  let processedRows = 0;
  let finalResult: UploadResult | null = null;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const isFirst = chunkIdx === 0;
    const isLast  = chunkIdx === chunks.length - 1;

    const body = {
      funnelId,
      funnelName,
      sourceType,
      fileName: file.name,
      columnMapping,
      domainHeader,
      websiteHeader,
      rows: chunk,
      batchId,
      seenDomains,
      isFirst,
      isLast,
      prevTotals,
    };

    const res = await fetch('/api/upload/batch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `Upload chunk ${chunkIdx + 1} failed (HTTP ${res.status})`);
    }

    const data = await res.json() as {
      done: boolean;
      batchId: number;
      seenDomains: string[];
      totals: Partial<UploadResult>;
    };

    batchId     = data.batchId;
    seenDomains = data.seenDomains ?? seenDomains;
    prevTotals  = data.totals ?? prevTotals;

    processedRows += chunk.length;
    onProgress?.({
      processed:  processedRows,
      total:      totalRows,
      pct:        Math.min(100, Math.round((processedRows / totalRows) * 100)),
      finalizing: isLast,
      phase:      isLast ? 'finalizing' : 'uploading',
    });

    if (data.done) {
      finalResult = data.totals as UploadResult;
    }
  }

  onProgress?.({ processed: totalRows, total: totalRows, pct: 100, finalizing: false });

  if (!finalResult) throw new Error('Upload ended without a final result');
  return finalResult;
}

// ─── Unified entry point ──────────────────────────────────────────────────────
// Transparently routes to the chunked or streaming path based on file size.
// Used by upload-to-funnel-dialog so all upload surfaces benefit automatically.

export interface UnifiedUploadOptions {
  file: File;
  formData: FormData;         // pre-built for the streaming path
  sourceType: CsvSourceType;
  columnMapping: Record<string, string>;
  domainHeader: string;
  websiteHeader?: string;
  funnelId: number;
  funnelName?: string;
  onProgress?: (p: UploadProgress) => void;
}

export async function uploadCsvUnified(opts: UnifiedUploadOptions): Promise<UploadResult> {
  const { file, formData, sourceType, columnMapping, domainHeader, websiteHeader, funnelId, funnelName, onProgress } = opts;

  if (file.size > CHUNK_THRESHOLD_BYTES) {
    // Large file — chunked JSON path (bypasses 4.5 MB limit)
    return uploadCsvChunked({
      file, funnelId, funnelName, sourceType, columnMapping, domainHeader, websiteHeader, onProgress,
    });
  }

  // Small file — existing streaming FormData path (unchanged)
  return uploadCsv(formData, onProgress);
}
