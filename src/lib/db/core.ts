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

export async function qp<T = DbRow>(query: string, values: unknown[] = []): Promise<T[]> {
  const result = await pool().query(query, values);
  return result.rows as T[];
}

export async function qdb<T = DbRow>(query: string, values: unknown[] = []): Promise<T[]> {
  let n = 0;
  const numbered = query.replace(/\?/g, () => `$${++n}`);
  const result = await pool().query(numbered, values);
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
