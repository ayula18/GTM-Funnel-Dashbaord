import { pool } from './src/lib/db/core';

async function main() {
  try {
    const res = await pool().query("SELECT domain, is_in_apollo, employee_reo, icp_decision, company_classification, confidence, short_description, classification_reason, scrape_status FROM companies WHERE domain = 'ternary.app'");
    console.log("Companies:", res.rows);
    
    const scrapeRes = await pool().query("SELECT domain, status, length(html), length(jina_text) FROM scrape_cache WHERE domain = 'ternary.app'");
    console.log("Scrape cache:", scrapeRes.rows);
    
    const textRes = await pool().query("SELECT substring(jina_text from 1 for 1000) as txt FROM scrape_cache WHERE domain = 'ternary.app'");
    console.log("Jina text start:", textRes.rows[0]?.txt);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

main();
