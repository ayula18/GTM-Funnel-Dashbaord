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
  const maxClients = parseInt(process.env.PG_POOL_MAX || '10', 10);
  _pool = new Pool({
    host:     parsed.hostname,
    port:     parseInt(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\/+/, ''),
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl:      { rejectUnauthorized: false },
    max:      maxClients,
    idleTimeoutMillis:       10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle:         true,
  });
  return _pool;
}

/** A database row. Callers may pass a concrete shape: `qp<{ id: number }>(...)`. */
export type DbRow = Record<string, unknown>;

// Transient connection failures that a retry resolves. On serverless (Vercel),
// the FIRST query after a cold start / fresh deploy can hit a dropped or
// half-open pooler connection — node-postgres discards the bad client, so the
// retry simply gets a fresh one. Without this, that first request 500s and the
// dashboard shows empty until a manual refresh.
const TRANSIENT_DB_ERROR =
  /ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|Connection terminated|terminating connection|connection timeout|timeout exceeded|server closed the connection|Client has encountered a connection error|connection is closed/i;

async function runQuery(text: string, values: unknown[]) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool().query(text, values);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_DB_ERROR.test(msg)) throw err;        // real error — don't mask it
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
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
