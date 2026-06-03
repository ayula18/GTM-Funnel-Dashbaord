import { pool, qp, qdb, withTx } from './core';
import { getMasterIcpCount } from './master';
import { writePolicy } from '../source-policy';
import type { CsvSourceType } from '../types';

// ── Company Queries ────────────────────────────────────────────────────────

const ALL_COMPANY_FIELDS = [
  'company_name', 'domain_aliases', 'apollo_employees', 'employee_reo',
  'website', 'company_linkedin_url', 'company_country', 'total_funding',
  'latest_funding', 'latest_funding_amount', 'last_raised_at', 'annual_revenue',
  'sic_codes', 'naics_codes', 'short_description', 'founded_year',
  'subsidiary_of', 'is_in_apollo', 'company_classification', 'category',
  'sub_category', 'company_type', 'icp_fit_level', 'icp_decision',
  'confidence', 'is_devtool', 'is_netnew', 'manual_icp', 'manual_notes',
  'scrape_status', 'classification_reason', 'observations',
  'needs_manual_review', 'classified_at',
  'crunchbase_funding', 'crunchbase_funding_type', 'revenue_reo',
  'parent_domain', 'is_sub_product', 'discard_reason', 'discard_step',
  'is_nonprofit', 'icp_rerun_count', 'last_icp_method',
];

export interface FieldChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

export interface UpsertResult {
  id: number;
  wasInsert: boolean;
  applied: FieldChange[];   // fields actually written (with before/after) — the audit trail
  skipped: string[];        // fields blocked by source policy (owned by another source)
}

const toText = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/**
 * Upsert a company while ENFORCING source ownership and CAPTURING every change.
 *
 * `opts.source`         — the CSV source, drives the write policy (see source-policy.ts).
 * `opts.explicitFields` — fields the user manually mapped; they bypass the lock
 *                          and always overwrite (the deliberate escape hatch).
 *
 * Returns the exact set of applied changes (old → new) so the caller can write
 * an audit row per change and support rollback.
 */
export async function upsertCompanyTracked(
  data: Record<string, unknown>,
  opts: { source: CsvSourceType; explicitFields?: Set<string> },
): Promise<UpsertResult> {
  const domain = data.domain as string;
  const explicit = opts.explicitFields ?? new Set<string>();
  const existingRows = await qp('SELECT * FROM companies WHERE domain = $1', [domain]);
  const existing = existingRows[0] ?? null;

  const applied: FieldChange[] = [];
  const skipped: string[] = [];

  // Decide, per candidate field, whether the write is allowed and whether it
  // actually changes anything.
  const writes: Array<{ field: string; value: unknown }> = [];

  for (const field of ALL_COMPANY_FIELDS) {
    const value = data[field];
    if (value === undefined || value === null || value === '') continue;

    const mode = explicit.has(field) ? 'overwrite' : writePolicy(field, opts.source);

    if (mode === 'skip') { skipped.push(field); continue; }

    const oldVal = existing ? existing[field] : null;

    if (mode === 'fill_empty' && oldVal !== null && oldVal !== undefined && oldVal !== '') {
      continue; // keep existing — don't clobber another source's value
    }

    const oldText = toText(oldVal);
    const newText = toText(value);
    if (oldText === newText) continue; // no-op, nothing to record

    writes.push({ field, value });
    applied.push({ field, old_value: oldText, new_value: newText });
  }

  if (existing) {
    const existingId = existing.id as number;
    if (writes.length > 0) {
      const sets = writes.map(w => `${w.field} = ?`);
      sets.push('updated_at = NOW()');
      const values = [...writes.map(w => w.value), existingId];
      await qdb(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    return { id: existingId, wasInsert: false, applied, skipped };
  }

  const cols = ['domain', ...writes.map(w => w.field)];
  const vals = [domain, ...writes.map(w => w.value)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool().query(
    `INSERT INTO companies (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return { id: result.rows[0].id as number, wasInsert: true, applied, skipped };
}

export async function linkCompanyToFunnel(companyId: number, funnelId: number) {
  await qp(
    'INSERT INTO funnel_companies (funnel_id, company_id) VALUES ($1, $2) ON CONFLICT (funnel_id, company_id) DO NOTHING',
    [funnelId, companyId],
  );
}

// Multi-select facet columns (filter key → SQL column). Shared so the table
// query and the filter-dropdown counts apply IDENTICAL scoping.
export const FACET_COLUMNS: Record<string, string> = {
  icp_decision:           'c.icp_decision',
  company_classification: 'c.company_classification',
  category:               'c.category',
  confidence:             'c.confidence',
  icp_fit_level:          'c.icp_fit_level',
  company_type:           'c.company_type',
  company_country:        'c.company_country',
  scrape_status:          'c.scrape_status',
  discard_reason:         'c.discard_reason',
  manual_icp:             'c.manual_icp',
};

/**
 * Canonical funnel-step gates — the SINGLE source of truth for "what it takes
 * to advance past step N". Used by BOTH the funnel-bar counts (getFunnelSteps)
 * AND the per-step table filter (funnel_step), so a step's badge and the rows
 * you see when you click it always agree. Thresholds mirror computeDiscardReasons.
 *
 *   step 2 = reached Apollo · step 3 = has employees · step 4 = ICP=Yes ·
 *   step 5 = funded or has revenue (>$100k)
 */
export const FUNNEL_STEP_GATES: Record<number, string> = {
  2: 'c.is_in_apollo = 1',
  3: '(COALESCE(c.employee_reo, 0) > 0 OR COALESCE(c.apollo_employees, 0) > 1)',
  4: "c.icp_decision = 'Yes'",
  5: '(GREATEST(COALESCE(c.total_funding, 0), COALESCE(c.crunchbase_funding, 0)) > 100000 OR GREATEST(COALESCE(c.annual_revenue, 0), COALESCE(c.revenue_reo, 0)) > 100000)',
};

/** Cumulative WHERE fragment for "passed through step N" (gates 2..N AND-ed). */
export function passedStepClause(step: number): string {
  const gates: string[] = [];
  for (let n = 2; n <= step; n++) if (FUNNEL_STEP_GATES[n]) gates.push(FUNNEL_STEP_GATES[n]);
  return gates.join(' AND ');
}

/**
 * Build the shared WHERE/JOIN for company queries. Used by BOTH `getCompanies`
 * (the table) and `getFilterOptions` (the dropdown counts), so facet counts
 * always match the rows you actually see — scoped by funnel, step, tab, search
 * and every other active filter, excluding merged companies.
 *
 * `excludeKey` omits one facet's own selection (standard faceted-search
 * behaviour: an ICP=No selection shouldn't zero out the Yes/Review counts in
 * the ICP dropdown itself).
 */
export function buildCompanyFilter(
  funnelId: number | null,
  filters: Record<string, unknown>,
  excludeKey?: string,
): { joinClause: string; whereClause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let joinClause = '';

  if (funnelId) {
    joinClause = 'JOIN funnel_companies fc ON c.id = fc.company_id';
    conditions.push('fc.funnel_id = ?');
    values.push(funnelId);
  }

  if (filters.search) {
    conditions.push('(c.domain ILIKE ? OR c.company_name ILIKE ? OR c.category ILIKE ?)');
    const s = `%${filters.search}%`;
    values.push(s, s, s);
  }

  conditions.push('c.merged_into_id IS NULL');

  for (const [key, col] of Object.entries(FACET_COLUMNS)) {
    if (key === excludeKey) continue;
    if (filters[key]) {
      const vals = String(filters[key]).split(',').map(v => v.trim()).filter(Boolean);
      if (vals.length === 1) {
        conditions.push(`${col} = ?`); values.push(vals[0]);
      } else if (vals.length > 1) {
        conditions.push(`${col} IN (${vals.map(() => '?').join(',')})`);
        values.push(...vals);
      }
    }
  }

  if (filters.is_subsidiary === true) { conditions.push("c.subsidiary_of IS NOT NULL AND c.subsidiary_of != ''"); }
  if (filters.is_netnew          !== undefined) { conditions.push('c.is_netnew = ?');          values.push(filters.is_netnew ? 1 : 0); }
  if (filters.needs_manual_review !== undefined) { conditions.push('c.needs_manual_review = ?'); values.push(filters.needs_manual_review ? 1 : 0); }
  if (filters.is_in_apollo        !== undefined) { conditions.push('c.is_in_apollo = ?');        values.push(filters.is_in_apollo ? 1 : 0); }

  const rangeFilters: Array<[string, string, '>=' | '<=']> = [
    ['min_employees',          '(COALESCE(c.employee_reo, c.apollo_employees, 0))', '>='],
    ['max_employees',          '(COALESCE(c.employee_reo, c.apollo_employees, 0))', '<='],
    ['min_funding',            'c.total_funding',                                   '>='],
    ['max_funding',            'c.total_funding',                                   '<='],
    ['min_crunchbase_funding', 'c.crunchbase_funding',                              '>='],
    ['max_crunchbase_funding', 'c.crunchbase_funding',                              '<='],
    ['min_revenue',            'COALESCE(c.annual_revenue, c.revenue_reo, 0)',      '>='],
    ['max_revenue',            'COALESCE(c.annual_revenue, c.revenue_reo, 0)',      '<='],
    ['min_founded_year',       'c.founded_year',                                    '>='],
    ['max_founded_year',       'c.founded_year',                                    '<='],
  ];
  for (const [key, col, op] of rangeFilters) {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
      conditions.push(`${col} ${op} ?`); values.push(filters[key]);
    }
  }

  if (filters.discard_step !== undefined) { conditions.push('c.discard_step = ?'); values.push(filters.discard_step); }

  // Funnel step = "passed through step N" (cumulative canonical gates). No
  // bound params — the gates are fixed SQL — so `values` is unaffected.
  if (filters.funnel_step !== undefined && filters.funnel_step !== '') {
    const step = Number(filters.funnel_step);
    const clause = passedStepClause(step);
    if (clause) conditions.push(`(${clause})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { joinClause, whereClause, values };
}

export async function getCompanies(funnelId: number | null, filters: Record<string, unknown> = {}) {
  const { joinClause, whereClause, values } = buildCompanyFilter(funnelId, filters);
  const sortBy       = (filters.sort_by    as string) || 'c.company_name';
  const sortOrder    = (filters.sort_order as string) || 'asc';
  const validSortCols = [
    'c.domain', 'c.company_name', 'c.apollo_employees', 'c.employee_reo',
    'c.total_funding', 'c.annual_revenue', 'c.icp_decision', 'c.category',
    'c.confidence', 'c.company_classification', 'c.founded_year',
    'c.created_at', 'c.updated_at', 'c.classified_at',
    'c.crunchbase_funding', 'c.revenue_reo', 'c.discard_reason', 'c.id',
  ];
  const safeSortBy    = validSortCols.includes(sortBy) ? sortBy : 'c.company_name';
  const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

  const page    = Math.max(1, (filters.page     as number) || 1);
  const perPage = Math.min(100000, Math.max(1, (filters.per_page as number) || 50));
  const offset  = (page - 1) * perPage;

  const [countRows] = await qdb(
    `SELECT COUNT(DISTINCT c.id) AS total FROM companies c ${joinClause} ${whereClause}`,
    values,
  );
  const total = Number(countRows.total);

  const data = await qdb(`
    SELECT DISTINCT c.*,
      (SELECT STRING_AGG(domain, ',') FROM companies mc WHERE mc.merged_into_id = c.id) AS merged_domains
    FROM companies c ${joinClause} ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder} NULLS LAST
    LIMIT ? OFFSET ?
  `, [...values, perPage, offset]);

  return { data, pagination: { total, page, per_page: perPage, totalPages: Math.ceil(total / perPage) } };
}

export async function updateCompany(id: number, data: Record<string, unknown>) {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue;
    sets.push(`${key} = ?`);
    values.push(value);
  }
  if (sets.length === 0) return;

  sets.push('updated_at = NOW()');
  values.push(id);
  await qdb(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function getCompanyById(id: number) {
  const rows = await qp('SELECT * FROM companies WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// ── Discard Reason Computation ────────────────────────────────────────────────────────

export async function computeDiscardReasons(funnelId: number) {
  const rows = await qp(`
    SELECT c.id, c.is_in_apollo, c.employee_reo, c.apollo_employees,
           c.icp_decision, c.total_funding, c.annual_revenue,
           c.crunchbase_funding, c.revenue_reo, c.scrape_status, c.manual_icp
    FROM funnel_companies fc JOIN companies c ON fc.company_id = c.id
    WHERE fc.funnel_id = $1
  `, [funnelId]);

  await withTx(async (client) => {
    for (const r of rows) {
      const id       = r.id as number;
      const manualIcp = r.manual_icp as string | null;

      if (r.scrape_status === 'domain_dead') {
        await client.query("UPDATE companies SET discard_reason = 'dead_domain', discard_step = 1 WHERE id = $1", [id]);
        continue;
      }
      if (manualIcp === 'Yes') {
        await client.query('UPDATE companies SET discard_reason = NULL, discard_step = NULL WHERE id = $1', [id]);
        continue;
      }
      if (!r.is_in_apollo) {
        await client.query("UPDATE companies SET discard_reason = 'not_in_apollo', discard_step = 2 WHERE id = $1", [id]);
        continue;
      }
      const empReo    = (r.employee_reo    as number) || 0;
      const empApollo = (r.apollo_employees as number) || 0;
      if (empReo <= 0 && empApollo <= 1) {
        await client.query("UPDATE companies SET discard_reason = 'low_employees', discard_step = 3 WHERE id = $1", [id]);
        continue;
      }
      if (r.icp_decision !== 'Yes') {
        await client.query("UPDATE companies SET discard_reason = 'not_icp', discard_step = 4 WHERE id = $1", [id]);
        continue;
      }
      const funding = Math.max((r.total_funding as number) || 0, (r.crunchbase_funding as number) || 0);
      const revenue = Math.max((r.annual_revenue as number) || 0, (r.revenue_reo as number) || 0);
      if (funding <= 100000 && revenue <= 100000) {
        await client.query("UPDATE companies SET discard_reason = 'low_funding', discard_step = 5 WHERE id = $1", [id]);
        continue;
      }
      await client.query('UPDATE companies SET discard_reason = NULL, discard_step = NULL WHERE id = $1', [id]);
    }
  });
}

// ── Scrape Cache ────────────────────────────────────────────────────────

export async function getCachedScrape(domain: string) {
  const rows = await qp('SELECT * FROM scrape_cache WHERE domain = $1', [domain]);
  return (rows[0] ?? undefined) as { domain: string; html: string; jina_text: string; status: string } | undefined;
}

export async function setCachedScrape(domain: string, html: string | null, jinaText: string | null, status: string) {
  await qp(
    'INSERT INTO scrape_cache (domain, html, jina_text, status, scraped_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (domain) DO UPDATE SET html = EXCLUDED.html, jina_text = EXCLUDED.jina_text, status = EXCLUDED.status, scraped_at = NOW()',
    [domain, html, jinaText, status],
  );
}

// ── Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(funnelId?: number) {
  let fromClause  = 'FROM companies c';
  let whereClause = '';
  const params: unknown[] = [];

  if (funnelId) {
    fromClause  += ' JOIN funnel_companies fc ON c.id = fc.company_id';
    whereClause  = 'WHERE fc.funnel_id = ?';
    params.push(funnelId);
  }

  const grp = (col: string) =>
    qdb(`SELECT ${col}, COUNT(*) AS count ${fromClause} ${whereClause ? whereClause + ' AND' : 'WHERE'} ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count DESC`, params);

  // All scalar counts in ONE pass via conditional aggregation — instead of a
  // dozen separate COUNT queries that previously exhausted the connection pool.
  const countsQuery = `
    SELECT
      COUNT(*)                                                                      AS total,
      COUNT(*) FILTER (WHERE c.is_in_apollo = 1)                                    AS in_apollo,
      COUNT(*) FILTER (WHERE c.icp_decision = 'Yes')                                AS icp_yes,
      COUNT(*) FILTER (WHERE c.icp_decision = 'No')                                 AS icp_no,
      COUNT(*) FILTER (WHERE c.icp_decision = 'Review' OR c.icp_decision IS NULL)   AS icp_review,
      COUNT(*) FILTER (WHERE c.is_netnew = 1)                                       AS netnew,
      COUNT(*) FILTER (WHERE c.scrape_status = 'domain_dead')                       AS dead_domains,
      COUNT(*) FILTER (WHERE c.icp_decision = 'No' AND c.manual_icp = 'Yes')        AS false_negatives,
      COUNT(*) FILTER (WHERE c.classified_at IS NOT NULL)                           AS total_classified,
      COUNT(*) FILTER (WHERE c.scrape_status = 'success')                           AS scrape_success,
      COUNT(*) FILTER (WHERE c.subsidiary_of IS NOT NULL AND c.subsidiary_of != '') AS acquired_count
    ${fromClause} ${whereClause}
  `;

  const [
    countsRows,
    classBreakdown, catBreakdown, confBreakdown, typeBreakdown, fitBreakdown, discardBreakdown,
    funnelCount, masterIcpCount,
  ] = await Promise.all([
    qdb(countsQuery, params),
    grp('c.company_classification'),
    grp('c.category'),
    grp('c.confidence'),
    grp('c.company_type'),
    grp('c.icp_fit_level'),
    grp('c.discard_reason'),
    qp("SELECT COUNT(*) AS c FROM funnels WHERE status = 'active'").then(rows => Number(rows[0].c)),
    getMasterIcpCount(),
  ]);

  const r = countsRows[0] as Record<string, string>;
  const total          = Number(r.total);
  const inApollo       = Number(r.in_apollo);
  const icpYes         = Number(r.icp_yes);
  const icpNo          = Number(r.icp_no);
  const icpReview      = Number(r.icp_review);
  const netnew         = Number(r.netnew);
  const deadDomains    = Number(r.dead_domains);
  const falseNegatives = Number(r.false_negatives);
  const totalClassified= Number(r.total_classified);
  const scrapeSuccess  = Number(r.scrape_success);
  const acquiredCount  = Number(r.acquired_count);

  const scrapeSuccessRate = totalClassified > 0 ? Math.round((scrapeSuccess / totalClassified) * 100) : 0;

  return {
    total,
    in_apollo:                inApollo,
    icp_yes:                  icpYes,
    icp_no:                   icpNo,
    icp_review:               icpReview,
    netnew,
    funnel_count:             funnelCount,
    master_icp_count:         masterIcpCount,
    acquired_count:           acquiredCount,
    dead_domains:             deadDomains,
    false_negatives:          falseNegatives,
    scrape_success_rate:      scrapeSuccessRate,
    classification_breakdown: classBreakdown,
    category_breakdown:       catBreakdown,
    confidence_breakdown:     confBreakdown,
    company_type_breakdown:   typeBreakdown,
    fit_level_breakdown:      fitBreakdown,
    discard_breakdown:        discardBreakdown,
  };
}

// ── Unclassified companies for pipeline ────────────────────────────────────────────────────────

export async function getUnclassifiedCompanies(funnelId: number, limit: number = 10): Promise<Array<Record<string, unknown>>> {
  return qp(`
    SELECT c.* FROM companies c
    JOIN funnel_companies fc ON c.id = fc.company_id
    WHERE fc.funnel_id = $1 AND c.classified_at IS NULL
    ORDER BY c.id LIMIT $2
  `, [funnelId, limit]);
}
