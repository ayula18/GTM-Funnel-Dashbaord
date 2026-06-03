import type { UploadResult } from './types';

export interface UploadProgress {
  processed: number;
  total: number;
  pct: number;
  finalizing?: boolean;
}

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

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(trimmed); } catch { return; }

    if (msg.type === 'progress') {
      const total = (msg.total as number) || 0;
      const processed = (msg.processed as number) || 0;
      onProgress?.({
        processed,
        total,
        pct: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
        finalizing: msg.phase === 'finalizing',
      });
    } else if (msg.type === 'done') {
      result = msg.result as UploadResult;
    } else if (msg.type === 'error') {
      errorMsg = (msg.error as string) || 'Upload failed';
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer) handle(buffer);

  if (errorMsg) throw new Error(errorMsg);
  if (!result) throw new Error('Upload ended unexpectedly without a result');
  return result;
}
