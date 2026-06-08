const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.gskgprbadsxsgjbzxjgv:%40yush%40180711@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  await client.connect();
  const res = await client.query("SELECT domain, is_in_apollo, employee_reo, icp_decision, company_classification, confidence, classification_reason, scrape_status FROM companies WHERE domain = 'ternary.app'");
  console.log("COMPANY:");
  console.log(res.rows);
  
  const cache = await client.query("SELECT status, length(html), length(jina_text) FROM scrape_cache WHERE domain = 'ternary.app'");
  console.log("CACHE:");
  console.log(cache.rows);
  
  const cacheText = await client.query("SELECT substring(jina_text from 1 for 2000) as txt FROM scrape_cache WHERE domain = 'ternary.app'");
  console.log("JINA TEXT:");
  console.log(cacheText.rows[0]?.txt);

  await client.end();
}
run().catch(console.error);
