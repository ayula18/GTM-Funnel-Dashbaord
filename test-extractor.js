const { Client } = require('pg');
const cheerio = require('cheerio');

function extractSignals(domain, html) {
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const h1 = $('h1').first().text().trim();

  let page_text = '';
  $('h2, h3, p, li').each((_, el) => {
    page_text += $(el).text().trim() + ' ';
  });
  page_text = page_text.replace(/\s+/g, ' ').trim().slice(0, 3000);
  
  let footer_text = '';
  $('footer').find('a, span, p, div').each((_, el) => {
    footer_text += $(el).text().trim() + ' ';
  });
  footer_text = footer_text.replace(/\s+/g, ' ').trim().slice(0, 1500);

  return { title, description, h1, page_text, footer_text };
}

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.gskgprbadsxsgjbzxjgv:%40yush%40180711@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  await client.connect();
  const cache = await client.query("SELECT html FROM scrape_cache WHERE domain = 'ternary.app'");
  
  if (cache.rows[0] && cache.rows[0].html) {
    const signals = extractSignals('ternary.app', cache.rows[0].html);
    console.log("EXTRACTED SIGNALS:");
    console.log("TITLE:", signals.title);
    console.log("DESCRIPTION:", signals.description);
    console.log("H1:", signals.h1);
    console.log("PAGE TEXT:", signals.page_text);
  } else {
    console.log("No HTML found");
  }

  await client.end();
}
run().catch(console.error);
