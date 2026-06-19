/**
 * GTM bucketing — the SINGLE source of truth for segmenting a qualified company
 * into a go-to-market bucket. Used by the categorization board, the funnel/
 * categorization Excel export, AND the Raw Classifier tool, so every surface
 * applies identical rules.
 *
 * Rules (per product spec):
 *   Irrelevant   — not a DevTool company, no dev affiliation            (not qualified)
 *   Future ICP   — Dev Services (IT Services) or API/SDK companies      (not qualified)
 *   Immature     — DevTool + sales=0 & funding<$5M & revenue<$3M        (not qualified)
 *   Startup      — DevTool + sales=1, OR sales=0 & (funding>$5M or rev>$3M)  (qualified)
 *   SMB          — DevTool + <200 employees & sales≥2                    (qualified)
 *   Commercial   — DevTool + 200–499 employees                          (qualified)
 *   Enterprise   — DevTool + 500+ employees                             (qualified)
 *   Unclassified — insufficient data / needs manual review              (not qualified)
 *
 * Sales Team count drives SMB/Startup/Immature for sub-200-employee companies.
 * When sales is UNKNOWN: ≥50 employees → SMB; <50 but clearly funded → Startup;
 * otherwise the case is ambiguous → Unclassified + flagged for manual review.
 *
 * Funding uses Apollo `total_funding` then Crunchbase `crunchbase_funding`;
 * revenue uses Reo `revenue_reo` then Apollo `annual_revenue` (2-source fallback).
 *
 * PURE module (no DB/server imports) so it is safe to import anywhere.
 */
import { autoMapField } from './csv-detect';

export type BucketId =
  | 'enterprise' | 'commercial' | 'smb' | 'startup'
  | 'immature' | 'future_icp' | 'irrelevant' | 'unclassified';

export interface BucketMeta {
  id: BucketId;
  label: string;
  description: string;
  qualified: boolean;
}

export const BUCKET_META: Record<BucketId, BucketMeta> = {
  enterprise:   { id: 'enterprise',   label: 'Enterprise',   description: 'DevTool + 500+ Employees',                          qualified: true  },
  commercial:   { id: 'commercial',   label: 'Commercial',   description: 'DevTool + 200–499 Employees',                       qualified: true  },
  smb:          { id: 'smb',          label: 'SMB',          description: 'DevTool + <200 Emp & Sales ≥ 2',                    qualified: true  },
  startup:      { id: 'startup',      label: 'Startup',      description: 'DevTool + Sales = 1, or Sales = 0 & Funded (>$5M / >$3M)', qualified: true  },
  immature:     { id: 'immature',     label: 'Immature',     description: 'DevTool + Sales = 0 & Funding < $5M & Revenue < $3M', qualified: false },
  future_icp:   { id: 'future_icp',   label: 'Future ICP',   description: 'IT Services & Solutions or API/SDK companies',       qualified: false },
  irrelevant:   { id: 'irrelevant',   label: 'Irrelevant',   description: 'Not a DevTool company',                             qualified: false },
  unclassified: { id: 'unclassified', label: 'Unclassified', description: 'Insufficient data — needs manual review',           qualified: false },
};

/** The bucket-relevant subset of a company. */
export interface BucketInput {
  company_classification?: string | null;
  category?: string | null;
  sub_category?: string | null;
  apollo_employees?: number | null;
  employee_reo?: number | null;
  crunchbase_employees?: number | null;
  total_funding?: number | null;
  crunchbase_funding?: number | null;
  annual_revenue?: number | null;
  revenue_reo?: number | null;
  sales_team_count?: number | null;
  manual_gtm_bucket?: string | null;
}

export interface BucketResult {
  bucket: BucketId;
  needsReview: boolean;
  reason: string;
}

const FIVE_M  = 5_000_000;
const THREE_M = 3_000_000;

/** Classify a company into a GTM bucket, with a review flag + human reason. */
export function classifyBucket(company: BucketInput): BucketResult {
  // A manual override always wins.
  const manual = company.manual_gtm_bucket;
  if (manual && Object.prototype.hasOwnProperty.call(BUCKET_META, manual)) {
    return { bucket: manual as BucketId, needsReview: false, reason: 'Manual override' };
  }

  const cls          = (company.company_classification || '').trim();
  const isDevTool    = cls === 'DevTool' || cls === 'DevTools';
  const isITServices = cls === 'IT Services & Solutions';
  const categoryStr  = `${company.category || ''} ${company.sub_category || ''}`.toLowerCase();
  const isApiSdk     = categoryStr.includes('api') || categoryStr.includes('sdk');

  const employees = Number(company.employee_reo) || Number(company.apollo_employees) || Number(company.crunchbase_employees) || 0;
  // 2-source preference: Apollo funding first, then Crunchbase.
  const funding   = Number(company.total_funding) || Number(company.crunchbase_funding) || 0;
  // 2-source preference: Reo revenue first, then Apollo annual revenue.
  const revenue   = Number(company.revenue_reo)   || Number(company.annual_revenue)    || 0;

  const sc = company.sales_team_count;
  const salesKnown = sc !== null && sc !== undefined && String(sc).trim() !== '' && !Number.isNaN(Number(sc));
  const salesTeam  = salesKnown ? Number(sc) : null;

  // ── Non-DevTool ─────────────────────────────────────────────────────────
  if (!isDevTool) {
    if (isITServices || isApiSdk) return { bucket: 'future_icp', needsReview: false, reason: 'Dev services / API-SDK company' };
    return { bucket: 'irrelevant', needsReview: false, reason: 'Not a DevTool company' };
  }

  // ── DevTool: employee-tier first ────────────────────────────────────────
  if (employees >= 500) return { bucket: 'enterprise', needsReview: false, reason: '500+ employees' };
  if (employees >= 200) return { bucket: 'commercial', needsReview: false, reason: '200–499 employees' };

  // ── DevTool, <200 employees: Sales-Team driven (per spec) ───────────────
  if (salesTeam !== null) {
    if (salesTeam >= 2) return { bucket: 'smb',     needsReview: false, reason: '<200 emp & Sales ≥ 2' };
    if (salesTeam >= 1) return { bucket: 'startup', needsReview: false, reason: 'Sales = 1' };
    // sales = 0
    if (funding >= FIVE_M || revenue >= THREE_M) return { bucket: 'startup',  needsReview: false, reason: 'Sales = 0 & funded (>$5M / >$3M)' };
    return { bucket: 'immature', needsReview: false, reason: 'Sales = 0 & funding < $5M & revenue < $3M' };
  }

  // ── DevTool, <200 employees, Sales UNKNOWN ──────────────────────────────
  // Mostly small companies. Keep the employee proxy where it's safe; flag the
  // genuinely ambiguous small/unfunded cases for manual review.
  if (employees >= 50) return { bucket: 'smb', needsReview: false, reason: 'Sales unknown; ≥50 employees' };
  if (funding >= FIVE_M || revenue >= THREE_M) return { bucket: 'startup', needsReview: false, reason: 'Sales unknown but clearly funded (>$5M / >$3M)' };

  return {
    bucket: 'unclassified',
    needsReview: true,
    reason: 'DevTool but <50 employees, sales unknown & no clear funding — needs manual review',
  };
}

/** Bucket id only (back-compat for the board + export). */
export function getBucketId(company: BucketInput): BucketId {
  return classifyBucket(company).bucket;
}

// ── Raw CSV row → BucketInput ──────────────────────────────────────────────

const NUMERIC_BUCKET_FIELDS = new Set([
  'apollo_employees', 'employee_reo', 'crunchbase_employees', 'total_funding', 'crunchbase_funding',
  'annual_revenue', 'revenue_reo', 'sales_team_count',
]);

function parseNum(value: string): number | null {
  const t = (value || '').trim();
  if (!t || t === 'N/A' || t === '-' || /^not\s*found$/i.test(t)) return null;

  // ── Range values (Crunchbase: "101-250", "501-1,000") → midpoint ──────
  const rangeMatch = t.match(/^[\s$€£]*([0-9][0-9,]*)\s*[-–—]\s*([0-9][0-9,]*)/);
  if (rangeMatch) {
    const low  = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (!isNaN(low) && !isNaN(high)) return Math.round((low + high) / 2);
  }

  // ── Open-ended ("10001+", "10,000+") ──────────────────────────────────
  const plusMatch = t.match(/^[\s$€£]*([0-9][0-9,]*)\s*\+/);
  if (plusMatch) {
    const n = parseFloat(plusMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return n;
  }

  // ── Standard numeric with optional k/m/b suffix ───────────────────────
  const cleaned = t.replace(/[$,\s]/g, '').toLowerCase();
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  if (cleaned.includes('b')) return n * 1e9;
  if (cleaned.includes('m')) return n * 1e6;
  if (cleaned.includes('k')) return n * 1e3;
  return n;
}

/** Normalize a free-text classification cell to a canonical class, or null. */
export function normalizeClassification(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  // A bare yes/no is ambiguous (e.g. an "Is Services?" column) — ignore it.
  if (/^(yes|no|true|false|y|n)$/i.test(s)) return null;
  const l = s.toLowerCase();
  if (l.includes('devtool')) return 'DevTool';
  if (l.includes('it service') || l.includes('services')) return 'IT Services & Solutions';
  if (l.includes('not relevant') || l.includes('irrelevant') || l.includes('not a devtool')) return 'Not Relevant';
  return s; // already a recognizable label
}

export const BUCKET_FIELDS = [
  'company_classification', 'category', 'sub_category',
  'apollo_employees', 'employee_reo', 'crunchbase_employees', 'total_funding', 'crunchbase_funding',
  'annual_revenue', 'revenue_reo', 'sales_team_count',
] as const;

/**
 * Map a CSV header row to the bucket-relevant fields. Returns one entry per
 * header (the mapped field name, or null) plus the set of bucket fields that
 * were actually detected — so the caller can warn about missing inputs.
 */
export function detectBucketColumns(headers: string[]): {
  headerFields: (string | null)[];
  detected: Record<string, string>;   // field → original header
} {
  const headerFields: (string | null)[] = [];
  const detected: Record<string, string> = {};
  for (const h of headers) {
    const field = autoMapField(h);
    const relevant = field && (NUMERIC_BUCKET_FIELDS.has(field) || field === 'company_classification' || field === 'category' || field === 'sub_category' || field === 'is_devtool');
    headerFields.push(relevant ? field : null);
    if (relevant && field && !(field in detected)) detected[field] = h;
  }
  return { headerFields, detected };
}

/** Build a BucketInput from one CSV row using a precomputed header→field map. */
export function rowToBucketInput(headerFields: (string | null)[], row: string[]): BucketInput {
  const input: BucketInput = {};
  for (let i = 0; i < headerFields.length; i++) {
    const field = headerFields[i];
    if (!field) continue;
    const raw = (row[i] ?? '').toString().trim();
    if (!raw) continue;

    if (field === 'company_classification') {
      input.company_classification = input.company_classification || normalizeClassification(raw);
    } else if (field === 'is_devtool') {
      if (/^(yes|true|1|devtool)/i.test(raw)) input.company_classification = input.company_classification || 'DevTool';
    } else if (field === 'category') {
      input.category = raw;
    } else if (field === 'sub_category') {
      input.sub_category = raw;
    } else if (NUMERIC_BUCKET_FIELDS.has(field)) {
      (input as Record<string, unknown>)[field] = parseNum(raw);
    }
  }
  return input;
}
