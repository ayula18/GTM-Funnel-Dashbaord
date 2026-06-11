const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});

const STRIP_PREFIXES = new Set([
  'www', 'docs', 'doc', 'blog', 'app', 'api', 'status', 'support',
  'help', 'dev', 'developer', 'developers', 'portal', 'dashboard',
  'console', 'admin', 'staging', 'demo', 'cdn', 'assets', 'static',
  'mail', 'm', 'mobile', 'go', 'get', 'try', 'info', 'about',
  'learn', 'community', 'forum', 'wiki', 'kb', 'knowledge',
  'cloud', 'platform', 'hub', 'store', 'shop', 'download',
  'downloads', 'release', 'releases', 'changelog', 'updates',
]);

const TWO_PART_TLDS = new Set([
  'co.uk', 'co.in', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.il',
  'com.au', 'com.br', 'com.cn', 'com.mx', 'com.sg', 'com.tr',
  'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'edu.au',
]);

const HOSTING_DOMAINS = new Set([
  'netlify.app', 'vercel.app', 'herokuapp.com', 'github.io',
  'gitlab.io', 'pages.dev', 'fly.dev', 'railway.app',
  'render.com', 'onrender.com', 'surge.sh', 'now.sh',
  'firebaseapp.com', 'web.app', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
]);

function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let domain = input.trim().toLowerCase().replace(/^https?:\/\//, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  domain = domain.split(':')[0].replace(/\.+$/, '');
  if (!domain || !domain.includes('.')) return domain;
  
  for (const hd of HOSTING_DOMAINS) {
    if (domain.endsWith('.' + hd) || domain === hd) return domain;
  }
  
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (TWO_PART_TLDS.has(lastTwo)) {
      if (parts.length >= 4) {
        const sub = parts.slice(0, -3).join('.');
        if (STRIP_PREFIXES.has(sub) || parts.length > 4) {
          return parts.slice(-3).join('.');
        }
      }
      return parts.slice(-3).join('.');
    }
  }
  
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (STRIP_PREFIXES.has(subdomain)) {
      return parts.slice(1).join('.');
    }
    if (parts.length > 3) {
      return parts.slice(-2).join('.');
    }
  }
  
  return domain;
}

function extractRootName(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return '';
  const parts = normalized.split('.');
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts[parts.length - 3];
  }
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0];
}

function isExactRootMatch(d1, d2) {
  if (!d1 || !d2) return false;
  const n1 = normalizeDomain(d1);
  const n2 = normalizeDomain(d2);
  if (n1 === n2) return true;
  const r1 = extractRootName(n1);
  const r2 = extractRootName(n2);
  if (!r1 || !r2 || r1.length < 3 || r2.length < 3) return false;
  return r1 === r2;
}

async function run() {
  const masterRes = await pool.query('SELECT domain FROM master_icp');
  const masterDomains = masterRes.rows.map(r => r.domain);
  
  const allCompanies = await pool.query('SELECT id, domain, is_netnew FROM companies');
  
  let toNetNew0 = [];
  let toNetNew1 = [];
  
  for (const c of allCompanies.rows) {
    let shouldBeNetNew0 = false;
    for (const mDomain of masterDomains) {
      if (isExactRootMatch(c.domain, mDomain)) {
        shouldBeNetNew0 = true;
        break;
      }
    }
    
    if (shouldBeNetNew0 && c.is_netnew !== 0) {
      toNetNew0.push(c.id);
    } else if (!shouldBeNetNew0 && c.is_netnew === 0) {
      toNetNew1.push(c.id);
    }
  }
  
  if (toNetNew0.length > 0) {
    console.log(`Setting is_netnew = 0 for ${toNetNew0.length} companies...`);
    await pool.query('UPDATE companies SET is_netnew = 0 WHERE id = ANY($1::int[])', [toNetNew0]);
  }
  if (toNetNew1.length > 0) {
    console.log(`Setting is_netnew = 1 for ${toNetNew1.length} companies (reverting bad sync)...`);
    await pool.query('UPDATE companies SET is_netnew = 1 WHERE id = ANY($1::int[])', [toNetNew1]);
  }
  
  console.log('Done!');
  await pool.end();
}

run().catch(console.error);
