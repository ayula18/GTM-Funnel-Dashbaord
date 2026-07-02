/**
 * Auditor Dev-Signal Scanner v2
 *
 * Performs an INDEPENDENT check of a company's website to detect
 * developer-facing signals. Gives the AI Auditor its own eyes.
 *
 * Fixes vs v1:
 * 1. Scrape quality detection — distinguishes "no signals found" from "scrape failed"
 * 2. Jina AI fallback if cached HTML is a thin JS-SPA shell
 * 3. scrape_quality in the result so the LLM knows when to distrust a score of 0
 *
 * NOTE: No category shortcuts. Agent 1's category can be wrong — that is
 * exactly why this auditor exists. All decisions are based on independent
 * website evidence only.
 */

import { getCachedScrape } from '../db';

// Minimum character threshold to consider a scrape "rich" (not a SPA shell)
const MIN_RICH_CONTENT_LENGTH = 800;
// Minimum word count to consider content meaningful
const MIN_WORD_COUNT = 80;

export type ScrapeQuality = 'rich' | 'thin' | 'failed' | 'blocked';

export interface DevSignalScan {
  domain: string;
  has_dev_signals: boolean;
  signals_found: string[];
  signal_score: number;          // 0-10, higher = more dev-facing
  raw_evidence: string;
  scrape_quality: ScrapeQuality; // Tells the LLM how much to trust score=0
}

// ─── Patterns that indicate developer-facing links in page HTML ───────────
const DEV_LINK_PATTERNS = [
  /developers?\./, /docs\./, /api\./, /portal\./,
  /\/developers?/i, /\/docs/i, /\/api(?![\w-])/i, /\/documentation/i,
  /\/sdk/i, /\/libraries/i, /\/quickstart/i, /\/getting-started/i,
  /github\.com/i, /gitlab\.com/i, /bitbucket\.org/i,
  /npmjs\.com/i, /pypi\.org/i, /crates\.io/i, /hub\.docker\.com/i,
  /pkg\.go\.dev/i, /nuget\.org/i, /rubygems\.org/i, /mvnrepository\.com/i,
];

// ─── Patterns that indicate developer-facing text content ─────────────────
const DEV_TEXT_PATTERNS = [
  /\bapi\s+(reference|documentation|docs|key|token|endpoint)/i,
  /\brest\s*api\b/i,
  /\bgraphql\b/i,
  /\bwebhook[s]?\b/i,
  /\bsdk\b/i,
  /\bcli\b/i,
  /\bdeveloper\s+(hub|portal|center|guide|documentation|docs|resources)\b/i,
  /\btechnical\s+documentation\b/i,
  /\bopen[\s-]?source\b/i,
  /\bgithub\b/i,
  /\bgitlab\b/i,
  /\bapache\s+2\.0\b/i,
  /\bmit\s+license\b/i,
  /\bgpl\b/i,
  /\bcode\s+sample[s]?\b/i,
  /\bcode\s+snippet[s]?\b/i,
  /\bintegrat(?:e|ion)\s+(?:guide|docs|documentation)\b/i,
  /\bnpm\s+install\b/i,
  /\bpip\s+install\b/i,
  /\byarn\s+add\b/i,
  /\bdocker\s+pull\b/i,
  /\bhelm\s+install\b/i,
  /\bbrew\s+install\b/i,
  /\bcargo\s+add\b/i,
  /\bgo\s+get\b/i,
  /\bgem\s+install\b/i,
  /\bkubernetes\b/i,
  /\bterraform\b/i,
  /\bci\/cd\b/i,
  /\bdevops\b/i,
  /\bmicroservices?\b/i,
  /\bserverless\b/i,
  /\bslack\s+community\b/i,
  /\bdeveloper\s+community\b/i,
  /\bchangelog\b/i,
  /\brelease\s+notes\b/i,
];

// ─── Strong signals — each one counts double ──────────────────────────────
const STRONG_DEV_SIGNALS = new Set([
  /\bdeveloper\s+(hub|portal)\b/i,
  /\bapi\s+(reference|documentation|docs)\b/i,
  /\bsdk\b/i,
  /\bopen[\s-]?source\b/i,
  /\bgithub\.com\b/i,
  /\bnpm\s+install\b/i,
  /\bpip\s+install\b/i,
  /\bdocker\s+pull\b/i,
  /\bhelm\b/i,
  /\btechnical\s+documentation\b/i,
  /\bcode\s+sample[s]?\b/i,
  /\bintegration\s+guide\b/i,
  /\bkubernetes\b/i,
  /\bterraform\b/i,
  /\bdevops\b/i,
]);

/**
 * Determine if scraped HTML is rich enough to be meaningful,
 * or just a JS SPA shell.
 */
function assessContentQuality(html: string): ScrapeQuality {
  if (!html || html.length === 0) return 'failed';

  // Detect obvious SPA shells — tiny HTML with no real body content
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = textOnly.split(/\s+/).filter(w => w.length > 2).length;

  if (textOnly.length < MIN_RICH_CONTENT_LENGTH || wordCount < MIN_WORD_COUNT) {
    return 'thin'; // JS SPA shell — can't trust signal score
  }

  return 'rich';
}

/**
 * Try Jina AI reader as a fallback for JS-heavy sites.
 * Jina renders JS and returns clean markdown text.
 */
async function fetchViaJina(domain: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`https://r.jina.ai/https://${domain}`, {
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 200) return text;
    }
  } catch {
    // Jina failed
  }
  return null;
}

/**
 * Main scanner: scan a domain for developer-facing signals.
 * Returns the signal score AND the scrape quality so the LLM
 * knows whether to trust a score of 0.
 */
export async function scanDevSignals(
  domain: string,
): Promise<DevSignalScan> {
  const empty: DevSignalScan = {
    domain,
    has_dev_signals: false,
    signals_found: [],
    signal_score: 0,
    raw_evidence: '',
    scrape_quality: 'failed',
  };

  // ── Step 1: Try cached scrape from Agent 1 ────────────────────────────
  let pageText = '';
  let quality: ScrapeQuality = 'failed';

  try {
    const cached = await getCachedScrape(domain);
    if (cached?.html) {
      const q = assessContentQuality(cached.html);
      if (q === 'rich') {
        pageText = cached.html;
        quality = 'rich';
      } else if (q === 'thin') {
        // Cache exists but content is a thin JS shell — try Jina
        quality = 'thin';
      }
      // If cached.status === 'blocked' or 'failed', pageText stays empty
    }
  } catch {
    // Cache lookup failed — fall through to live fetch
  }

  // ── Step 2: If cache was thin/missing, try a fresh fetch ─────────────
  if (!pageText) {
    // First try direct fetch
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const q = assessContentQuality(html);
        if (q === 'rich') {
          pageText = html;
          quality = 'rich';
        } else {
          // Still thin — try Jina
          quality = 'thin';
        }
      }
    } catch {
      // Direct fetch failed
      quality = quality === 'thin' ? 'thin' : 'blocked';
    }
  }

  // ── Step 3: Jina fallback for thin/blocked ────────────────────────────
  if (!pageText && (quality === 'thin' || quality === 'blocked' || quality === 'failed')) {
    const jinaText = await fetchViaJina(domain);
    if (jinaText) {
      pageText = jinaText;
      quality = assessContentQuality(jinaText) === 'rich' ? 'rich' : 'thin';
    }
  }

  // ── Step 4: Still nothing? Return with accurate scrape status ─────────
  if (!pageText) {
    return { ...empty, scrape_quality: quality };
  }

  // ── Step 5: Run pattern matching on whatever text we have ─────────────
  const fullText = pageText.toLowerCase();
  const signals: string[] = [];
  const evidence: string[] = [];

  for (const pattern of DEV_LINK_PATTERNS) {
    if (pattern.test(pageText)) {
      const match = pageText.match(pattern);
      if (match) {
        const name = describeLinkPattern(pattern);
        if (!signals.includes(name)) {
          signals.push(name);
          evidence.push(match[0].slice(0, 80));
        }
      }
    }
  }

  for (const pattern of DEV_TEXT_PATTERNS) {
    if (pattern.test(fullText)) {
      const match = fullText.match(pattern);
      if (match) {
        const name = describeTextPattern(pattern);
        if (!signals.includes(name)) {
          signals.push(name);
          evidence.push(match[0].slice(0, 80));
        }
      }
    }
  }

  // Strong signals count double
  let strongBonus = 0;
  for (const pattern of STRONG_DEV_SIGNALS) {
    if (pattern.test(fullText)) strongBonus++;
  }

  const score = Math.min(10, signals.length + strongBonus);

  return {
    domain,
    has_dev_signals: signals.length > 0,
    signals_found: signals,
    signal_score: score,
    raw_evidence: evidence.slice(0, 5).join(' | '),
    scrape_quality: quality,
  };
}

// ─── Pattern description helpers ──────────────────────────────────────────

function describeLinkPattern(p: RegExp): string {
  const s = p.source;
  if (s.includes('developer')) return 'Developer Portal/Docs Link';
  if (s.includes('docs\\.')) return 'Docs Subdomain';
  if (s.includes('api\\.')) return 'API Subdomain';
  if (s.includes('github')) return 'GitHub Link';
  if (s.includes('gitlab')) return 'GitLab Link';
  if (s.includes('npmjs')) return 'NPM Package';
  if (s.includes('pypi')) return 'PyPI Package';
  if (s.includes('docker')) return 'Docker Image';
  if (s.includes('sdk')) return 'SDK Link';
  if (s.includes('quickstart')) return 'Quickstart Guide';
  if (s.includes('getting-started')) return 'Getting Started';
  if (s.includes('documentation')) return 'Documentation Link';
  if (s.includes('\\/api')) return 'API Endpoint Link';
  return 'Dev Link';
}

function describeTextPattern(p: RegExp): string {
  const s = p.source;
  if (s.includes('api') && s.includes('reference')) return 'API Reference/Docs';
  if (s.includes('rest')) return 'REST API';
  if (s.includes('graphql')) return 'GraphQL';
  if (s.includes('webhook')) return 'Webhooks';
  if (s.includes('sdk')) return 'SDK Mention';
  if (s.includes('cli')) return 'CLI Tool';
  if (s.includes('developer') && s.includes('hub')) return 'Developer Hub';
  if (s.includes('developer') && s.includes('portal')) return 'Developer Portal';
  if (s.includes('developer') && s.includes('community')) return 'Developer Community';
  if (s.includes('open') && s.includes('source')) return 'Open Source';
  if (s.includes('github')) return 'GitHub Mention';
  if (s.includes('gitlab')) return 'GitLab Mention';
  if (s.includes('npm')) return 'NPM Install';
  if (s.includes('pip')) return 'Pip Install';
  if (s.includes('docker') && s.includes('pull')) return 'Docker Pull';
  if (s.includes('helm')) return 'Helm Chart';
  if (s.includes('kubernetes')) return 'Kubernetes';
  if (s.includes('terraform')) return 'Terraform';
  if (s.includes('ci\\/cd')) return 'CI/CD';
  if (s.includes('devops')) return 'DevOps';
  if (s.includes('changelog')) return 'Changelog';
  if (s.includes('integration') && s.includes('guide')) return 'Integration Guide';
  if (s.includes('code') && s.includes('sample')) return 'Code Samples';
  if (s.includes('technical') && s.includes('documentation')) return 'Technical Docs';
  if (s.includes('serverless')) return 'Serverless';
  if (s.includes('microservice')) return 'Microservices';
  if (s.includes('slack')) return 'Slack Community';
  if (s.includes('release') && s.includes('notes')) return 'Release Notes';
  if (s.includes('apache')) return 'Apache License';
  if (s.includes('mit')) return 'MIT License';
  if (s.includes('gpl')) return 'GPL License';
  return 'Dev Signal';
}
