import { pool } from './src/lib/db/core.ts';

async function run() {
  const res = await pool().query("SELECT domain, company_name, subsidiary_of, created_at, updated_at FROM companies WHERE domain IN ('dev.to', 'forem.com')");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run();
