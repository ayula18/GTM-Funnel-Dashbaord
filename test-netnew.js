const { Pool } = require('pg');
async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});
  try {
    const res = await pool.query(`
      SELECT c.domain, c.company_name, m.domain as master_domain
      FROM companies c
      JOIN master_icp m ON split_part(c.domain, '.', 1) = split_part(m.domain, '.', 1)
      WHERE c.is_netnew = 1 AND c.domain != m.domain
      LIMIT 10;
    `);
    console.log(res.rows);
  } finally {
    await pool.end();
  }
}
run().catch(console.error);
