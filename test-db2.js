const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.gskgprbadsxsgjbzxjgv:%40yush%40180711@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  await client.connect();
  const cache = await client.query("SELECT html IS NULL as html_null, jina_text IS NULL as jina_null, status FROM scrape_cache WHERE domain = 'ternary.app'");
  console.log("CACHE CHECK:");
  console.log(cache.rows);
  
  await client.end();
}
run().catch(console.error);
