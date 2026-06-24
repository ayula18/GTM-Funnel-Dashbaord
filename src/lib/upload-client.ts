import type { UploadResult, CsvSourceType } from './types';
import Papa from 'papaparse';
import { autoMapField } from './csv-detect';
import {
  saveSession, clearSession, type UploadSession,
} from './upload-session';

export interface UploadProgress {
  processed: number;
  total: number;
  pct: number;
  finalizing?: boolean;
  phase?: string;
  /** Set during a resume so the UI can show "Resuming from X%" */
  resumeFromPct?: number;
}

// ─── Small-file path (≤ CHUNK_THRESHOLD) ─────────────────────────────────────
// Sends the raw file as FormData to /api/upload and streams NDJSON progress.

const CHUNK_THRESHOLD_BYTES = 0; // Force chunked path for ALL files to avoid Vercel 60s timeout
const ROWS_PER_CHUNK        = 25;

/**
 * POST a CSV to /api/upload and stream live progress.
 */
export async function uploadCsv(
  formData: FormData,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const ct = res.headers.get('content-type') || '';

  if (!ct.includes('ndjson') || !res.body) {
    let data: any = {};
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 100) };
    }
    if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
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

// ─── Chunked path ─────────────────────────────────────────────────────────────

export interface ChunkedUploadOptions {
  file: File;
  funnelId: number;
  funnelName?: string;
  sourceType: CsvSourceType;
  columnMapping: Record<string, string>;
  domainHeader: string;
  websiteHeader?: string;
  onProgress?: (p: UploadProgress) => void;
  /** When resuming, start from this chunk index (0-based). */
  resumeFromChunk?: number;
  /** When resuming, the batchId already created on the server. */
  resumeBatchId?: number;
  /** When resuming, seenDomains reconstructed from the server. */
  resumeSeenDomains?: string[];
  /** When resuming, running totals at the checkpoint. */
  resumePrevTotals?: Partial<UploadResult>;
}

export async function uploadCsvChunked(opts: ChunkedUploadOptions): Promise<UploadResult> {
  const {
    file, funnelName, sourceType, columnMapping, domainHeader, websiteHeader,
    onProgress,
    resumeFromChunk = 0,
    resumeBatchId,
    resumeSeenDomains,
    resumePrevTotals,
  } = opts;
  let funnelId = opts.funnelId;

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

  const chunksTotal = chunks.length;

  // ── 3. POST each chunk sequentially ─────────────────────────────────────
  let batchId: number | undefined = resumeBatchId;
  let seenDomains: string[] = resumeSeenDomains ?? [];
  let prevTotals: Partial<UploadResult> = resumePrevTotals ?? {};
  // Rows already committed (from previous chunks in a resume)
  let processedRows = resumeFromChunk * ROWS_PER_CHUNK;
  let finalResult: UploadResult | null = null;

  // Stored session for checkpointing (set after we know the batchId)
  let session: UploadSession | null = null;

  // On resume, report starting progress
  if (resumeFromChunk > 0) {
    onProgress?.({
      processed: processedRows,
      total: totalRows,
      pct: Math.min(100, Math.round((processedRows / totalRows) * 100)),
      phase: 'resuming',
      resumeFromPct: Math.round((processedRows / totalRows) * 100),
    });
  }

  for (let chunkIdx = resumeFromChunk; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const isFirst = chunkIdx === 0 && !resumeBatchId; // not first when resuming
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
      chunksTotal,
      prevTotals,
    };

    const res = await fetch('/api/upload/batch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let errorDesc = `Upload chunk ${chunkIdx + 1} failed (HTTP ${res.status})`;
      try {
        const data = JSON.parse(text);
        if (data.error) errorDesc = data.error;
      } catch {
        if (text) errorDesc += `: ${text.slice(0, 100)}`;
      }
      // Session is left in localStorage — user can resume
      throw new Error(errorDesc);
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

    // When creating a new funnel (funnelId was 0), server returns the real ID
    if (data.totals?.funnel_id) funnelId = data.totals.funnel_id as number;

    processedRows += chunk.length;

    // ── Checkpoint to localStorage after each successful chunk ───────────
    if (!session) {
      // First successful chunk — create the session record
      session = {
        batchId: batchId!,
        funnelId,
        funnelName: funnelName ?? '',
        fileName:   file.name,
        fileSize:   file.size,
        sourceType,
        columnMapping,
        domainHeader,
        websiteHeader,
        totalRows,
        chunksTotal,
        chunksDone: chunkIdx,
        prevTotals,
        startedAt:  new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      };
    } else {
      session.chunksDone = chunkIdx;
      session.prevTotals = prevTotals;
      session.funnelId   = funnelId; // may have changed if new funnel was created
    }
    saveSession(session);

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

  // ── Clear the session on success ─────────────────────────────────────────
  if (batchId) clearSession(batchId);

  if (!finalResult) throw new Error('Upload ended without a final result');
  return finalResult;
}

// ─── Resume an interrupted upload ────────────────────────────────────────────

/**
 * Validate that a re-selected file matches the original session file,
 * then reconstruct seenDomains from the server and continue from where
 * the upload left off.
 */
export async function resumeUploadSession(
  session: UploadSession,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  // Validate the re-selected file
  if (file.name !== session.fileName || file.size !== session.fileSize) {
    throw new Error(
      `File mismatch — please select "${session.fileName}" (${(session.fileSize / 1024).toFixed(0)} KB).`,
    );
  }

  // Fetch seenDomains from the server (reconstructed from match_decisions)
  const resumeRes = await fetch(`/api/upload/batch/resume?batchId=${session.batchId}`);
  if (!resumeRes.ok) {
    const err = await resumeRes.json().catch(() => ({ error: 'Resume failed' }));
    throw new Error(err.error || 'Failed to fetch resume state from server');
  }
  const resumeData = await resumeRes.json() as {
    seenDomains: string[];
    chunksDone: number;
    chunksTotal: number;
    prevTotals: Partial<UploadResult>;
  };

  // Use the server's authoritative chunk count (more reliable than localStorage)
  const startFromChunk = resumeData.chunksDone + 1;

  return uploadCsvChunked({
    file,
    funnelId:           session.funnelId,
    funnelName:         session.funnelName,
    sourceType:         session.sourceType,
    columnMapping:      session.columnMapping,
    domainHeader:       session.domainHeader,
    websiteHeader:      session.websiteHeader,
    onProgress,
    resumeFromChunk:    startFromChunk,
    resumeBatchId:      session.batchId,
    resumeSeenDomains:  resumeData.seenDomains,
    resumePrevTotals:   resumeData.prevTotals,
  });
}

// ─── Unified entry point ──────────────────────────────────────────────────────

export interface UnifiedUploadOptions {
  file: File;
  formData: FormData;
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
    return uploadCsvChunked({
      file, funnelId, funnelName, sourceType, columnMapping, domainHeader, websiteHeader, onProgress,
    });
  }

  return uploadCsv(formData, onProgress);
}
