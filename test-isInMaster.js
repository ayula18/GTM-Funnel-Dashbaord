const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});

// simple sharesRoot for testing
function extractRootName(domain) {
  const parts = domain.split('.');
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0];
}
function sharesRoot(d1, d2) {
  const r1 = extractRootName(d1);
  const r2 = extractRootName(d2);
  if (r1 === r2 && r1.length >= 3) return true;
  return false;
}

async function run() {
  const domain = 'encore.dev';
  const root = extractRootName(domain);
  const rows = await pool.query('SELECT domain FROM master_icp WHERE domain LIKE $1', [`%${root}%`]);
  let found = false;
  for (const row of rows.rows) {
    if (sharesRoot(row.domain, domain)) {
      console.log('Match found:', row.domain);
      found = true;
      break;
    }
  }
  console.log('isInMaster:', found);
  await pool.end();
}
run().catch(console.error);
