/**
 * OpenAI key management.
 *
 * We keep a PRIMARY key plus an optional BACKUP key so the pipeline keeps
 * running when the primary key runs out of credits / hits its billing quota.
 * Keys live in the environment ONLY (OPENAI_API_KEY, OPENAI_API_KEY_BACKUP) —
 * never hard-coded in source.
 */

/** All configured keys, primary first, de-duped, blanks trimmed out. */
export function openAIKeys(): string[] {
  return [process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY_BACKUP]
    .map(k => (k || '').trim())
    .filter((k, i, arr) => k.length > 0 && arr.indexOf(k) === i);
}

/** Backup keys only (everything after the primary). */
export function backupOpenAIKeys(): string[] {
  return openAIKeys().slice(1);
}

/**
 * True when an OpenAI error means THIS key is out of money / over quota — i.e.
 * failing over to a backup key could actually help.
 *
 * Deliberately NARROW: a plain rate-limit (rate_limit_exceeded), a request
 * timeout, or a network blip all return false, because retrying the SAME key is
 * the right move for those — a backup key wouldn't fix them.
 */
export function isInsufficientQuota(err: unknown): boolean {
  const e = err as {
    status?: number;
    code?: string;
    type?: string;
    error?: { code?: string; type?: string };
    message?: string;
  };
  const code = e?.code ?? e?.error?.code;
  const type = e?.type ?? e?.error?.type;
  if (code === 'insufficient_quota' || type === 'insufficient_quota') return true;

  const msg = (e?.message ?? '').toLowerCase();
  return (
    msg.includes('insufficient_quota') ||
    msg.includes('exceeded your current quota') ||
    (msg.includes('billing') && msg.includes('quota'))
  );
}
