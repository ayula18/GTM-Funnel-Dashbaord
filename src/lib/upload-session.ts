/**
 * upload-session.ts
 *
 * Browser-side localStorage manager for resumable upload sessions.
 * After every chunk is committed, the upload client saves a checkpoint here.
 * If the browser suspends mid-upload, the checkpoint survives and can be used
 * to resume from the exact chunk that failed.
 *
 * Storage key: `upload_session_<batchId>`
 * Expiry:      7 days (stale sessions are auto-purged on listPendingSessions())
 */

import type { CsvSourceType, UploadResult } from './types';

const SESSION_PREFIX = 'upload_session_';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface UploadSession {
  batchId: number;
  funnelId: number;
  funnelName: string;
  /** Original file name — shown in the Resume modal so the user knows which file to re-select. */
  fileName: string;
  /** Original file size in bytes — used to validate the re-selected file on resume. */
  fileSize: number;
  sourceType: CsvSourceType;
  columnMapping: Record<string, string>;
  domainHeader: string;
  websiteHeader?: string;
  totalRows: number;
  chunksTotal: number;
  /**
   * Index (0-based) of the last chunk that was fully committed to the server.
   * Resume starts from chunksDone + 1.
   * -1 means the first chunk has not yet completed.
   */
  chunksDone: number;
  /** Running totals at the last checkpoint — echoed back to avoid data loss. */
  prevTotals: Partial<UploadResult>;
  startedAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp — used for TTL
}

function key(batchId: number) {
  return `${SESSION_PREFIX}${batchId}`;
}

/** Persist (or overwrite) a session checkpoint. */
export function saveSession(session: UploadSession): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key(session.batchId), JSON.stringify({
      ...session,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // localStorage may be full or disabled — non-fatal
  }
}

/** Load a session by batchId, or null if not found / expired. */
export function loadSession(batchId: number): UploadSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(batchId));
    if (!raw) return null;
    const session: UploadSession = JSON.parse(raw);
    // Expire check
    if (Date.now() - new Date(session.updatedAt).getTime() > SESSION_TTL_MS) {
      localStorage.removeItem(key(batchId));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** Remove a session (called on successful completion). */
export function clearSession(batchId: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key(batchId));
  } catch { /* non-fatal */ }
}

/**
 * Return all pending (incomplete) sessions from localStorage, sorted newest first.
 * Stale sessions (older than TTL) are purged during this call.
 */
export function listPendingSessions(): UploadSession[] {
  if (typeof window === 'undefined') return [];
  const result: UploadSession[] = [];
  const expiredKeys: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(SESSION_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const session: UploadSession = JSON.parse(raw);
        if (Date.now() - new Date(session.updatedAt).getTime() > SESSION_TTL_MS) {
          expiredKeys.push(k);
        } else {
          result.push(session);
        }
      } catch {
        expiredKeys.push(k); // corrupt — purge
      }
    }
  } catch { /* non-fatal */ }

  // Purge expired
  for (const k of expiredKeys) {
    try { localStorage.removeItem(k); } catch { /* non-fatal */ }
  }

  return result.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
