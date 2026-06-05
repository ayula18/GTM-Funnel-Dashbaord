import { Pool, PoolClient } from 'pg';

let _pool: Pool | null = null;

export function pool(): Pool {
  if (_pool) return _pool;

  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL environment variable is not set');

  const parsed = new URL(connStr);
  // Pool size must stay UNDER the Supabase pooler's client limit (session mode
  // caps at ~15). For Vercel/serverless use the TRANSACTION pooler (port 6543),
  // which releases each connection right after the statement so a small pool
  // scales across many function instances. Override per-env with PG_POOL_MAX.
  const maxClients = parseInt(process.env.PG_POOL_MAX || '2', 10);
  _pool = new Pool({
    host:     parsed.hostname,
    port:     parseInt(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\/+/, ''),
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl:      { rejectUnauthorized: false },
    max:      maxClients,
    idleTimeoutMillis:       5000,
    // Fail a cold/stuck connect FAST (5s) so the retry loop can try again within
    // the function's time budget instead of one attempt eating 10s.
    connectionTimeoutMillis: 5000,
    keepAlive:               true,   // keep the TCP socket alive across warm invocations
    allowExitOnIdle:         true,
  });
  // A pool 'error' event on an idle client would otherwise crash the process —
  // swallow it; the next query just gets a fresh connection.
  _pool.on('error', () => { /* idle client dropped by the pooler — non-fatal */ });
  return _pool;
}

/** A database row. Callers may pass a concrete shape: `qp<{ id: number }>(...)`. */
export type DbRow = Record<string, unknown>;

// Transient connection failures that a retry resolves. On serverless (Vercel),
// the FIRST query after a cold start / fresh deploy can hit a dropped or
// half-open pooler connection — node-postgres discards the bad client, so the
// retry simply gets a fresh one. Without this, that first request 500s and the
// dashboard shows empty until a manual refresh.
// Connection-level failures (NOT SQL errors) that a retry resolves. These all
// happen before/around acquiring a socket, so retrying is safe and won't mask a
// genuine query bug (syntax, constraint, etc. are not matched here).
const TRANSIENT_DB_ERROR =
  /ECONN|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|getaddrinfo|socket hang up|connect|connection|terminat|timeout|server closed|pool is (draining|ending)|Client has encountered/i;

// Backoff schedule (ms). Total ≈ 7.7s of patience inside one request — long
// enough to ride out a cold Supabase pooler after a fresh deploy, short enough
// to stay within the serverless function budget.
const RETRY_BACKOFF = [200, 500, 1000, 2000, 4000];

async function runQuery(text: string, values: unknown[]) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF.length; attempt++) {
    try {
      return await pool().query(text, values);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_DB_ERROR.test(msg)) throw err;        // real SQL error — don't mask it
      if (attempt === RETRY_BACKOFF.length) break;
      await new Promise(r => setTimeout(r, RETRY_BACKOFF[attempt]));
    }
  }
  throw lastErr;
}

export async function qp<T = DbRow>(query: string, values: unknown[] = []): Promise<T[]> {
  const result = await runQuery(query, values);
  return result.rows as T[];
}

export async function qdb<T = DbRow>(query: string, values: unknown[] = []): Promise<T[]> {
  let n = 0;
  const numbered = query.replace(/\?/g, () => `$${++n}`);
  const result = await runQuery(numbered, values);
  return result.rows as T[];
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
