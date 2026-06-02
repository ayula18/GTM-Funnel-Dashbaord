/**
 * Domain normalization and matching utilities.
 * Handles: www.xyz.com → xyz.com, docs.xyz.com → xyz.com, etc.
 */

// Subdomains that should be stripped during normalization
const STRIP_PREFIXES = new Set([
  'www', 'docs', 'doc', 'blog', 'app', 'api', 'status', 'support',
  'help', 'dev', 'developer', 'developers', 'portal', 'dashboard',
  'console', 'admin', 'staging', 'demo', 'cdn', 'assets', 'static',
  'mail', 'm', 'mobile', 'go', 'get', 'try', 'info', 'about',
  'learn', 'community', 'forum', 'wiki', 'kb', 'knowledge',
  'cloud', 'platform', 'hub', 'store', 'shop', 'download',
  'downloads', 'release', 'releases', 'changelog', 'updates',
]);

// TLDs that are two-part (country code)
const TWO_PART_TLDS = new Set([
  'co.uk', 'co.in', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.il',
  'com.au', 'com.br', 'com.cn', 'com.mx', 'com.sg', 'com.tr',
  'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'edu.au',
]);

// CDN / hosting domains that should NOT be treated as company domains
const HOSTING_DOMAINS = new Set([
  'netlify.app', 'vercel.app', 'herokuapp.com', 'github.io',
  'gitlab.io', 'pages.dev', 'fly.dev', 'railway.app',
  'render.com', 'onrender.com', 'surge.sh', 'now.sh',
  'firebaseapp.com', 'web.app', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
]);

/**
 * Normalize a domain to its root form.
 * 
 * Examples:
 *   "www.splunk.com" → "splunk.com"
 *   "docs.splunk.com" → "splunk.com"
 *   "http://www.splunk.com/en" → "splunk.com"
 *   "SPLUNK.COM" → "splunk.com"
 *   "blog.xyz.io" → "xyz.io"
 */
export function normalizeDomain(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  let domain = input.trim().toLowerCase();
  
  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');
  
  // Remove path, query, hash, trailing slash
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  
  // Remove port
  domain = domain.split(':')[0];
  
  // Remove trailing dots
  domain = domain.replace(/\.+$/, '');
  
  if (!domain || !domain.includes('.')) return domain;
  
  // Check if it's a hosting/CDN domain — keep as-is (subdomain IS the identifier)
  for (const hd of HOSTING_DOMAINS) {
    if (domain.endsWith('.' + hd) || domain === hd) {
      return domain;
    }
  }
  
  const parts = domain.split('.');
  
  // Check for two-part TLD (e.g., co.uk)
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (TWO_PART_TLDS.has(lastTwo)) {
      // For two-part TLDs, keep domain + TLD (e.g., company.co.uk)
      if (parts.length >= 4) {
        // e.g., docs.company.co.uk → company.co.uk
        const sub = parts.slice(0, -3).join('.');
        if (STRIP_PREFIXES.has(sub) || parts.length > 4) {
          return parts.slice(-3).join('.');
        }
      }
      return parts.slice(-3).join('.');
    }
  }
  
  // Standard domain: strip known prefixes
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (STRIP_PREFIXES.has(subdomain)) {
      return parts.slice(1).join('.');
    }
    // If multiple subdomains (a.b.c.com), take last 2 parts
    if (parts.length > 3) {
      return parts.slice(-2).join('.');
    }
  }
  
  // For 2-part domains (xyz.com), return as-is
  return domain;
}

/**
 * Extract the root name from a domain (without TLD).
 * "splunk.com" → "splunk"
 * "xyz.io" → "xyz"
 * "company.co.uk" → "company"
 */
export function extractRootName(domain: string): string {
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

// ── Marketing Prefix Stripping ────────────────────────────────────────
// Companies register domains like trytruffle.ai, getpostman.com, usebraintrust.com.
// These prefixes are NOT subdomains — they're baked into the domain name itself.

const MARKETING_PREFIXES = [
  'try', 'get', 'use', 'go', 'my', 'hello', 'hey', 'meet',
  'with', 'join', 'run', 'start', 'build', 'make',
];

/**
 * Extract the "core" root name by stripping marketing prefixes from the root.
 * 
 * Examples:
 *   "trytruffle.ai"     → "truffle"
 *   "getpostman.com"     → "postman"
 *   "usebraintrust.com"  → "braintrust"
 *   "gocd.io"            → "cd"  (too short, returns full "gocd")
 *   "splunk.com"         → "splunk"  (no prefix to strip)
 */
export function extractCoreRoot(domain: string): string {
  const root = extractRootName(domain);
  if (!root || root.length < 4) return root;
  
  for (const prefix of MARKETING_PREFIXES) {
    if (root.startsWith(prefix) && root.length > prefix.length + 2) {
      // The remaining part after stripping must be meaningful (3+ chars)
      const remainder = root.slice(prefix.length);
      if (remainder.length >= 3) {
        return remainder;
      }
    }
  }
  
  return root;
}

/**
 * Normalize a company name for comparison.
 * Strips common suffixes, lowercases, removes punctuation.
 * 
 * "Truffle AI" → "truffle ai"
 * "Vibrant Labs, Inc." → "vibrant labs"
 * "HashiCorp, Inc" → "hashicorp"
 */
export function normalizeCompanyName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  let n = name.trim().toLowerCase();
  
  // Remove common suffixes
  n = n.replace(/,?\s*(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|gmbh|s\.?a\.?|b\.?v\.?|plc|pty\.?\s*ltd\.?)$/i, '');
  
  // Remove punctuation except spaces
  n = n.replace(/[^a-z0-9\s]/g, '');
  
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  
  return n;
}

// Placeholder / junk company names that must NEVER be used as a matching key.
// These show up when a source sheet fills blank name cells with a literal value.
const JUNK_NAMES = new Set([
  'unknown', 'n a', 'na', 'none', 'null', 'nil', 'tbd', 'tba',
  'company', 'companies', 'test', 'sample', 'example', 'unnamed',
  'not found', 'not available', 'no name', 'undefined', 'blank', 'empty',
]);

/**
 * True if a company name is a placeholder/junk value that should not be
 * stored or used as a duplicate-matching key.
 *
 *   isJunkName("Unknown")  → true
 *   isJunkName("N/A")      → true
 *   isJunkName("Splunk")   → false
 */
export function isJunkName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = normalizeCompanyName(name);
  if (!n || n.length < 3) return true;   // too short to be distinctive
  return JUNK_NAMES.has(n);
}

/**
 * Check if two domains share the same root.
 * Handles cases like: docs.splunk.com ↔ splunk.com
 * 
 * Examples:
 *   sharesRoot("docs.splunk.com", "splunk.com") → true
 *   sharesRoot("splunk.io", "splunk.com") → true (same root name)
 *   sharesRoot("abc.com", "xyz.com") → false
 */
export function sharesRoot(d1: string, d2: string): boolean {
  if (!d1 || !d2) return false;
  
  const n1 = normalizeDomain(d1);
  const n2 = normalizeDomain(d2);
  
  // Exact match after normalization
  if (n1 === n2) return true;
  
  // Compare root names (e.g., "splunk" from splunk.com and splunk.io)
  const r1 = extractRootName(n1);
  const r2 = extractRootName(n2);
  
  if (!r1 || !r2 || r1.length < 3 || r2.length < 3) return false;
  
  // Exact root name match
  if (r1 === r2) return true;
  
  // Fuzzy: one root contains the other (for cases like "datadoghq" and "datadog")
  if (r1.length > 4 && r2.includes(r1)) return true;
  if (r2.length > 4 && r1.includes(r2)) return true;
  
  return false;
}

/**
 * Find the best matching domain from a list for a given input domain.
 * Returns the matching domain or null.
 */
export function findMatchingDomain(
  input: string,
  existingDomains: string[]
): string | null {
  const normalized = normalizeDomain(input);
  
  // First: exact match after normalization
  const exact = existingDomains.find(d => normalizeDomain(d) === normalized);
  if (exact) return exact;
  
  // Second: sharesRoot match
  const rootMatch = existingDomains.find(d => sharesRoot(d, input));
  if (rootMatch) return rootMatch;
  
  return null;
}

/**
 * Clean a domain string from various messy input formats.
 */
export function cleanDomainInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  let cleaned = input.trim();
  
  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  
  // Remove "https://", "http://", "www."
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/^www\./i, '');
  
  // Remove path
  cleaned = cleaned.split('/')[0];
  
  // Remove port
  cleaned = cleaned.split(':')[0];
  
  return cleaned.toLowerCase().trim();
}
