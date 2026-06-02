import { Pool, PoolClient } from 'pg';
import { extractRootName, extractCoreRoot, normalizeCompanyName } from './domain-utils';

// ── Connection ─────────────────────────────────────────────────────────
// pg is CJS — works in all Next.js modes (dev/prod/Turbopack/Webpack).
// Pool is lazily initialized so module import never touches the DB.

let _pool: Pool | null = null;

function pool(): Pool {
  if (_pool) return _pool;

  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL environment variable is not set');

  // Parse the URL explicitly so URL-encoded chars (e.g. %40 → @) are always
  // decoded correctly regardless of which pg-connection-string version is bundled.
  const parsed = new URL(connStr);
  _pool = new Pool({
    host:     parsed.hostname,
    port:     parseInt(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\/+/, ''),
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl:      { rejectUnauthorized: false },
    max:      1,
    idleTimeoutMillis:       20000,
    connectionTimeoutMillis: 10000,
  });
  return _pool;
}

// ── Query helpers ──────────────────────────────────────────────────────

// Static parameterized query — $1/$2/... params, returns rows[]
async function qp(query: string, values: unknown[] = []): Promise<any[]> {
  const result = await pool().query(query, values as any[]);
  return result.rows;
}

// Dynamic query — built with ? placeholders converted to $1/$2/...
async function qdb(query: string, values: unknown[] = []): Promise<any[]> {
  let n = 0;
  const numbered = query.replace(/\?/g, () => `$${++n}`);
  const result = await pool().query(numbered, values as any[]);
  return result.rows;
}

// Transaction wrapper — automatic BEGIN/COMMIT/ROLLBACK
async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Export raw query fn for direct use in API routes
export { qp };

// ── Funnel Queries ─────────────────────────────────────────────────────

export async function createFunnel(name: string, description?: string): Promise<number> {
  const rows = await qp(
    'INSERT INTO funnels (name, description) VALUES ($1, $2) RETURNING id',
    [name, description ?? null],
  );
  return rows[0].id as number;
}

export async function getFunnels() {
  return qp(`
    SELECT f.*,
      COUNT(fc.id)                                                        AS total_companies,
      SUM(CASE WHEN c.icp_decision = 'Yes'                       THEN 1 ELSE 0 END) AS icp_yes,
      SUM(CASE WHEN c.icp_decision = 'No'                        THEN 1 ELSE 0 END) AS icp_no,
      SUM(CASE WHEN c.icp_decision = 'Review' OR c.icp_decision IS NULL THEN 1 ELSE 0 END) AS icp_review,
      SUM(CASE WHEN c.classified_at IS NOT NULL                  THEN 1 ELSE 0 END) AS classified,
      SUM(CASE WHEN c.classified_at IS NULL                      THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN c.is_netnew = 1                              THEN 1 ELSE 0 END) AS netnew
    FROM funnels f
    LEFT JOIN funnel_companies fc ON f.id = fc.funnel_id
    LEFT JOIN companies c ON fc.company_id = c.id
    WHERE f.status = 'active'
    GROUP BY f.id
    ORDER BY f.created_at DESC
  `);
}

export async function getFunnel(id: number) {
  const rows = await qp(`
    SELECT f.*,
      COUNT(fc.id)                                                        AS total_companies,
      SUM(CASE WHEN c.icp_decision = 'Yes'                       THEN 1 ELSE 0 END) AS icp_yes,
      SUM(CASE WHEN c.icp_decision = 'No'                        THEN 1 ELSE 0 END) AS icp_no,
      SUM(CASE WHEN c.icp_decision = 'Review' OR c.icp_decision IS NULL THEN 1 ELSE 0 END) AS icp_review,
      SUM(CASE WHEN c.classified_at IS NOT NULL                  THEN 1 ELSE 0 END) AS classified,
      SUM(CASE WHEN c.classified_at IS NULL                      THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN c.is_netnew = 1                              THEN 1 ELSE 0 END) AS netnew
    FROM funnels f
    LEFT JOIN funnel_companies fc ON f.id = fc.funnel_id
    LEFT JOIN companies c ON fc.company_id = c.id
    WHERE f.id = $1
    GROUP BY f.id
  `, [id]);
  return rows[0] ?? null;
}

export async function updateFunnel(id: number, data: { name?: string; description?: string; status?: string }) {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name        !== undefined) { sets.push('name = ?');        values.push(data.name); }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }
  if (data.status      !== undefined) { sets.push('status = ?');      values.push(data.status); }
  sets.push('updated_at = NOW()');

  values.push(id);
  await qdb(`UPDATE funnels SET ${sets.join(', ')} WHERE id = ?`, values);
}

// ── Funnel Step Counts (with drop counts) ─────────────────────────────

export async function getFunnelSteps(funnelId: number, _categoryFilter?: string) {
  const rows = await qp(`
    SELECT
      c.is_in_apollo, c.employee_reo, c.apollo_employees,
      c.icp_decision, c.company_classification, c.category,
      c.is_netnew, c.total_funding, c.annual_revenue,
      c.crunchbase_funding, c.revenue_reo
    FROM funnel_companies fc
    JOIN companies c ON fc.company_id = c.id
    WHERE fc.funnel_id = $1
  `, [funnelId]);

  const steps = {
    step1_raw: rows.length,
    step2_apollo: 0,   step2_drop: 0,
    step3_employees: 0, step3_drop: 0,
    step4_icp_total: 0, step4_icp_netnew: 0, step4_services: 0, step4_drop: 0,
    step5_funded_total: 0, step5_funded_netnew: 0, step5_drop: 0,
  };

  for (const r of rows) {
    const inApollo = !!r.is_in_apollo;
    if (!inApollo) continue;
    steps.step2_apollo++;

    const empReo    = (r.employee_reo    as number) || 0;
    const empApollo = (r.apollo_employees as number) || 0;
    if (empReo <= 0 && empApollo <= 1) continue;
    steps.step3_employees++;

    const icp            = r.icp_decision         as string;
    const classification = r.company_classification as string;
    if (classification === 'IT Services & Solutions') steps.step4_services++;

    if (icp === 'Yes') {
      steps.step4_icp_total++;
      if (r.is_netnew) steps.step4_icp_netnew++;

      const bestFunding = Math.max((r.total_funding as number) || 0, (r.crunchbase_funding as number) || 0);
      const bestRevenue = Math.max((r.annual_revenue as number) || 0, (r.revenue_reo as number) || 0);
      if (bestFunding > 100000 || bestRevenue > 100000) {
        steps.step5_funded_total++;
        if (r.is_netnew) steps.step5_funded_netnew++;
      }
    }
  }

  steps.step2_drop = steps.step1_raw       - steps.step2_apollo;
  steps.step3_drop = steps.step2_apollo    - steps.step3_employees;
  steps.step4_drop = steps.step3_employees - steps.step4_icp_total;
  steps.step5_drop = steps.step4_icp_total - steps.step5_funded_total;
  return steps;
}

// ── Domain Alias Resolution ───────────────────────────────────────────

export async function findCompanyByDomain(domain: string): Promise<{ id: number; domain: string } | null> {
  const exact = await qp('SELECT id, domain FROM companies WHERE domain = $1', [domain]);
  if (exact.length) return exact[0] as { id: number; domain: string };

  const alias = await qp('SELECT company_id FROM domain_aliases WHERE domain = $1', [domain]);
  if (alias.length) {
    const company = await qp('SELECT id, domain FROM companies WHERE id = $1', [alias[0].company_id]);
    if (company.length) return company[0] as { id: number; domain: string };
  }
  return null;
}

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low';
export type MatchType = 'exact_domain' | 'alias_lookup' | 'root_name' | 'core_root' | 'linkedin_url' | 'company_name';

export interface SmartMatchResult {
  id: number;
  domain: string;
  matchType: MatchType;
  confidence: MatchConfidence;
}

/**
 * Smart domain resolution with 6-priority matching.
 *
 * P1: Exact domain   P2: Alias lookup   P3: Root name (HIGH)
 * P4: Core root (MED) P5: LinkedIn (MED) P6: Company name (LOW)
 */
export async function findCompanyByDomainSmart(
  domain: string,
  companyName?: string,
  linkedinUrl?: string,
): Promise<SmartMatchResult | null> {
  // P1
  const exact = await qp('SELECT id, domain FROM companies WHERE domain = $1', [domain]);
  if (exact.length) return { ...(exact[0] as { id: number; domain: string }), matchType: 'exact_domain', confidence: 'exact' };

  // P2
  const alias = await qp('SELECT company_id FROM domain_aliases WHERE domain = $1', [domain]);
  if (alias.length) {
    const company = await qp('SELECT id, domain FROM companies WHERE id = $1', [alias[0].company_id]);
    if (company.length) return { ...(company[0] as { id: number; domain: string }), matchType: 'alias_lookup', confidence: 'exact' };
  }

  // P3: Root name
  const rootName = extractRootName(domain);
  if (rootName && rootName.length >= 3) {
    const rows = await qp(`
      SELECT da.company_id, c.domain
      FROM domain_aliases da JOIN companies c ON da.company_id = c.id
      WHERE da.root_name = $1 AND da.domain != $2 LIMIT 1
    `, [rootName, domain]);
    if (rows.length) return { id: rows[0].company_id as number, domain: rows[0].domain as string, matchType: 'root_name', confidence: 'high' };
  }

  // P4: Core root
  const coreRoot = extractCoreRoot(domain);
  if (coreRoot && coreRoot !== rootName && coreRoot.length >= 3) {
    const rows = await qp(`
      SELECT da.company_id, c.domain
      FROM domain_aliases da JOIN companies c ON da.company_id = c.id
      WHERE da.core_root = $1 AND da.domain != $2 LIMIT 1
    `, [coreRoot, domain]);
    if (rows.length) return { id: rows[0].company_id as number, domain: rows[0].domain as string, matchType: 'core_root', confidence: 'medium' };
  }

  // P5: LinkedIn URL
  if (linkedinUrl) {
    const cleanLinkedin = linkedinUrl.replace(/\/$/, '').toLowerCase();
    if (cleanLinkedin.includes('linkedin.com/company/')) {
      const slug = cleanLinkedin.split('linkedin.com/company/')[1]?.replace(/\//g, '') || '';
      const rows = await qp(`
        SELECT id, domain FROM companies
        WHERE company_linkedin_url IS NOT NULL
          AND LOWER(REPLACE(company_linkedin_url, '/', '')) LIKE $1
          AND domain != $2 LIMIT 1
      `, [`%${slug}%`, domain]);
      if (rows.length) return { ...(rows[0] as { id: number; domain: string }), matchType: 'linkedin_url', confidence: 'medium' };
    }
  }

  // P6: Company name (exact normalized)
  if (companyName) {
    const normalizedName = normalizeCompanyName(companyName);
    if (normalizedName && normalizedName.length >= 3) {
      const candidates = await qp(
        "SELECT id, domain, company_name FROM companies WHERE company_name IS NOT NULL AND company_name != '' AND domain != $1",
        [domain],
      );
      for (const c of candidates) {
        if (normalizeCompanyName(c.company_name as string) === normalizedName) {
          return { id: c.id as number, domain: c.domain as string, matchType: 'company_name', confidence: 'low' };
        }
      }
    }
  }

  return null;
}

export async function addDomainAlias(
  companyId: number,
  aliasDomain: string,
  rootName: string,
  source: string,
  isCanonical: boolean = false,
) {
  const coreRoot = extractCoreRoot(aliasDomain);
  await qp(
    'INSERT INTO domain_aliases (company_id, domain, root_name, core_root, source, is_canonical) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (domain) DO NOTHING',
    [companyId, aliasDomain, rootName, coreRoot, source, isCanonical ? 1 : 0],
  );
}

export async function getCompanyAliases(companyId: number): Promise<string[]> {
  const rows = await qp('SELECT domain FROM domain_aliases WHERE company_id = $1', [companyId]);
  return rows.map(r => r.domain as string);
}

export async function addDataSource(companyId: number, sourceType: string, sourceFile: string, fieldsUpdated: string[]) {
  await qp(
    'INSERT INTO data_sources (company_id, source_type, source_file, fields_updated) VALUES ($1, $2, $3, $4)',
    [companyId, sourceType, sourceFile, JSON.stringify(fieldsUpdated)],
  );
}

// ── Merge Candidates ──────────────────────────────────────────────────

export async function createMergeCandidate(
  companyId1: number,
  companyId2: number,
  matchType: string,
  matchDetail: string,
  confidence: string,
) {
  const [id1, id2] = companyId1 < companyId2 ? [companyId1, companyId2] : [companyId2, companyId1];

  const existing = await qp(
    'SELECT id, status FROM merge_candidates WHERE company_id_1 = $1 AND company_id_2 = $2',
    [id1, id2],
  );
  if (existing.length) return; // already exists (pending or rejected)

  await qp(
    'INSERT INTO merge_candidates (company_id_1, company_id_2, match_type, match_detail, confidence) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (company_id_1, company_id_2) DO NOTHING',
    [id1, id2, matchType, matchDetail, confidence],
  );
}

export async function getMergeCandidates(funnelId?: number) {
  let query = `
    SELECT mc.*,
      c1.domain AS domain_1, c1.company_name AS name_1, c1.company_linkedin_url AS linkedin_1,
      c1.apollo_employees AS employees_1, c1.total_funding AS funding_1,
      c1.icp_decision AS icp_1, c1.company_classification AS classification_1,
      c1.category AS category_1, c1.company_country AS country_1, c1.website AS website_1,
      c2.domain AS domain_2, c2.company_name AS name_2, c2.company_linkedin_url AS linkedin_2,
      c2.apollo_employees AS employees_2, c2.total_funding AS funding_2,
      c2.icp_decision AS icp_2, c2.company_classification AS classification_2,
      c2.category AS category_2, c2.company_country AS country_2, c2.website AS website_2
    FROM merge_candidates mc
    JOIN companies c1 ON mc.company_id_1 = c1.id
    JOIN companies c2 ON mc.company_id_2 = c2.id
  `;

  const params: unknown[] = [];
  if (funnelId) {
    query += `
      WHERE mc.status = 'pending'
        AND (EXISTS (SELECT 1 FROM funnel_companies fc WHERE fc.company_id = mc.company_id_1 AND fc.funnel_id = ?)
          OR EXISTS (SELECT 1 FROM funnel_companies fc WHERE fc.company_id = mc.company_id_2 AND fc.funnel_id = ?))
    `;
    params.push(funnelId, funnelId);
  } else {
    query += " WHERE mc.status = 'pending'";
  }
  query += ' ORDER BY mc.created_at DESC';
  return qdb(query, params);
}

export async function resolveMergeCandidate(id: number, action: 'approve' | 'reject') {
  if (action === 'reject') {
    await qp("UPDATE merge_candidates SET status = 'rejected', resolved_at = NOW() WHERE id = $1", [id]);
    return { action: 'rejected' };
  }

  const candidates = await qp('SELECT * FROM merge_candidates WHERE id = $1', [id]);
  if (!candidates.length) throw new Error('Merge candidate not found');

  const primaryId   = candidates[0].company_id_1 as number;
  const secondaryId = candidates[0].company_id_2 as number;

  await mergeCompanies(primaryId, secondaryId);
  await qp("UPDATE merge_candidates SET status = 'approved', resolved_at = NOW() WHERE id = $1", [id]);
  return { action: 'approved', primaryId, secondaryId };
}

export async function getPendingMergeCandidateCount(funnelId?: number): Promise<number> {
  if (funnelId) {
    const rows = await qp(`
      SELECT COUNT(*) AS count FROM merge_candidates mc
      WHERE mc.status = 'pending'
        AND (EXISTS (SELECT 1 FROM funnel_companies fc WHERE fc.company_id = mc.company_id_1 AND fc.funnel_id = $1)
          OR EXISTS (SELECT 1 FROM funnel_companies fc WHERE fc.company_id = mc.company_id_2 AND fc.funnel_id = $1))
    `, [funnelId]);
    return Number(rows[0].count);
  }
  const rows = await qp("SELECT COUNT(*) AS count FROM merge_candidates WHERE status = 'pending'");
  return Number(rows[0].count);
}

export async function scanForDuplicates(funnelId: number): Promise<number> {
  const companies = await qp(`
    SELECT c.id, c.domain, c.company_name, c.company_linkedin_url
    FROM companies c JOIN funnel_companies fc ON c.id = fc.company_id
    WHERE fc.funnel_id = $1
  `, [funnelId]);

  const aliasMap = new Map<number, { rootNames: Set<string>; coreRoots: Set<string> }>();
  for (const c of companies) {
    const aliases = await qp('SELECT root_name, core_root FROM domain_aliases WHERE company_id = $1', [c.id]);
    aliasMap.set(c.id as number, {
      rootNames: new Set(aliases.map(a => a.root_name as string)),
      coreRoots: new Set(aliases.filter(a => a.core_root).map(a => a.core_root as string)),
    });
  }

  const found = new Set<string>();
  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const c1 = companies[i];
      const c2 = companies[j];
      const pairKey = `${Math.min(c1.id, c2.id)}-${Math.max(c1.id, c2.id)}`;
      if (found.has(pairKey)) continue;

      const a1 = aliasMap.get(c1.id)!;
      const a2 = aliasMap.get(c2.id)!;

      for (const r of a1.rootNames) {
        if (a2.rootNames.has(r)) {
          found.add(pairKey);
          await createMergeCandidate(c1.id, c2.id, 'root_name', `Shared root: ${r}`, 'high');
          break;
        }
      }
      if (found.has(pairKey)) continue;

      for (const r of a1.coreRoots) {
        if (r.length >= 3 && a2.coreRoots.has(r)) {
          found.add(pairKey);
          await createMergeCandidate(c1.id, c2.id, 'core_root', `Shared core root: ${r}`, 'medium');
          break;
        }
      }
      if (found.has(pairKey)) continue;

      if (c1.company_name && c2.company_name) {
        const n1 = normalizeCompanyName(c1.company_name as string);
        const n2 = normalizeCompanyName(c2.company_name as string);
        if (n1 && n2 && n1.length >= 3 && n1 === n2) {
          found.add(pairKey);
          await createMergeCandidate(c1.id, c2.id, 'company_name', `Same name: ${c1.company_name}`, 'medium');
        }
      }
    }
  }
  return found.size;
}

// ── Company Queries ────────────────────────────────────────────────────

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

export async function upsertCompany(data: Record<string, unknown>): Promise<number> {
  const domain = data.domain as string;
  const existing = await qp('SELECT id FROM companies WHERE domain = $1', [domain]);

  if (existing.length) {
    const existingId = existing[0].id as number;
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const field of ALL_COMPANY_FIELDS) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
        sets.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      values.push(existingId);
      await qdb(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    return existingId;
  }

  const cols: string[] = ['domain'];
  const vals: unknown[] = [domain];

  for (const field of ALL_COMPANY_FIELDS) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      cols.push(field);
      vals.push(data[field]);
    }
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool().query(
    `INSERT INTO companies (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    vals as any[],
  );
  return result.rows[0].id as number;
}

export async function linkCompanyToFunnel(companyId: number, funnelId: number) {
  await qp(
    'INSERT INTO funnel_companies (funnel_id, company_id) VALUES ($1, $2) ON CONFLICT (funnel_id, company_id) DO NOTHING',
    [funnelId, companyId],
  );
}

export async function getCompanies(funnelId: number | null, filters: Record<string, unknown> = {}) {
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

  const multiFilters: Record<string, string> = {
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

  for (const [key, col] of Object.entries(multiFilters)) {
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

  const whereClause  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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

// ── Discard Reason Computation ────────────────────────────────────────

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

// ── Filter Options (for Excel-like dropdowns) ─────────────────────────

export async function getFilterOptions(funnelId: number | null) {
  let fromClause  = 'FROM companies c';
  let whereClause = '';
  const params: unknown[] = [];

  if (funnelId) {
    fromClause  += ' JOIN funnel_companies fc ON c.id = fc.company_id';
    whereClause  = 'WHERE fc.funnel_id = ?';
    params.push(funnelId);
  }

  const getDistinct = (col: string): Promise<Array<{ value: string; count: number }>> => {
    const query = whereClause
      ? `SELECT DISTINCT ${col} AS value, COUNT(*) AS count ${fromClause} ${whereClause} AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count DESC`
      : `SELECT DISTINCT ${col} AS value, COUNT(*) AS count ${fromClause} WHERE ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count DESC`;
    return qdb(query, params) as Promise<Array<{ value: string; count: number }>>;
  };

  const [
    icp_decision, company_classification, category, confidence,
    icp_fit_level, company_type, company_country, discard_reason,
    scrape_status, manual_icp,
  ] = await Promise.all([
    getDistinct('c.icp_decision'),
    getDistinct('c.company_classification'),
    getDistinct('c.category'),
    getDistinct('c.confidence'),
    getDistinct('c.icp_fit_level'),
    getDistinct('c.company_type'),
    getDistinct('c.company_country'),
    getDistinct('c.discard_reason'),
    getDistinct('c.scrape_status'),
    getDistinct('c.manual_icp'),
  ]);

  return { icp_decision, company_classification, category, confidence, icp_fit_level, company_type, company_country, discard_reason, scrape_status, manual_icp };
}

// ── Master ICP ─────────────────────────────────────────────────────────

export async function addMasterIcp(domain: string, companyName?: string) {
  await qp('INSERT INTO master_icp (domain, company_name) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [domain, companyName ?? null]);
}

export async function isInMasterIcp(domain: string): Promise<boolean> {
  const rows = await qp('SELECT 1 FROM master_icp WHERE domain = $1', [domain]);
  return rows.length > 0;
}

export async function getMasterIcpCount(): Promise<number> {
  const rows = await qp('SELECT COUNT(*) AS count FROM master_icp');
  return Number(rows[0].count);
}

export async function clearMasterIcp() {
  await qp('DELETE FROM master_icp');
}

export async function pushToMaster(companyIds: number[]) {
  await withTx(async (client) => {
    for (const id of companyIds) {
      await client.query(
        'INSERT INTO master_icp (domain, company_name) SELECT domain, company_name FROM companies WHERE id = $1 ON CONFLICT (domain) DO NOTHING',
        [id],
      );
      await client.query('UPDATE companies SET is_netnew = 0 WHERE id = $1', [id]);
    }
  });
}

// ── Merging Companies ──────────────────────────────────────────────────

export async function mergeCompanies(primaryId: number, secondaryId: number) {
  const primary   = await getCompanyById(primaryId)   as Record<string, any> | null;
  const secondary = await getCompanyById(secondaryId) as Record<string, any> | null;

  if (!primary || !secondary) throw new Error('Company not found');

  await withTx(async (client) => {
    // 1. Move domain aliases
    await client.query('UPDATE domain_aliases SET company_id = $1 WHERE company_id = $2', [primaryId, secondaryId]);

    // 2. Add secondary domain as alias for primary
    const coreRoot = extractCoreRoot(secondary.domain);
    const rootName = extractRootName(secondary.domain);
    await client.query(
      'INSERT INTO domain_aliases (company_id, domain, root_name, core_root, source, is_canonical) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (domain) DO NOTHING',
      [primaryId, secondary.domain, rootName, coreRoot, 'manual_merge', 0],
    );

    // 3. Move data sources
    await client.query('UPDATE data_sources SET company_id = $1 WHERE company_id = $2', [primaryId, secondaryId]);

    // 4. Move + remove funnel associations
    await client.query(
      'INSERT INTO funnel_companies (funnel_id, company_id) SELECT funnel_id, $1 FROM funnel_companies WHERE company_id = $2 ON CONFLICT (funnel_id, company_id) DO NOTHING',
      [primaryId, secondaryId],
    );
    await client.query('DELETE FROM funnel_companies WHERE company_id = $1', [secondaryId]);

    // 5. Merge data: prefer primary, fallback to secondary for nulls
    const updates: Record<string, any> = {};
    for (const key of Object.keys(secondary)) {
      if (['id', 'domain', 'created_at', 'updated_at', 'merged_into_id'].includes(key)) continue;
      if ((primary[key] === null || primary[key] === '' || primary[key] === undefined) &&
          (secondary[key] !== null && secondary[key] !== '' && secondary[key] !== undefined)) {
        updates[key] = secondary[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      const keys   = Object.keys(updates);
      const vals   = Object.values(updates);
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await client.query(
        `UPDATE companies SET ${setClauses}, updated_at = NOW() WHERE id = $${keys.length + 1}`,
        [...vals, primaryId],
      );
    }

    // 6. Set merge parent
    await client.query('UPDATE companies SET merged_into_id = $1 WHERE id = $2', [primaryId, secondaryId]);
  });

  // 7. Recompute discard reasons
  const funnels = await qp('SELECT DISTINCT funnel_id FROM funnel_companies WHERE company_id = $1', [primaryId]);
  for (const f of funnels) await computeDiscardReasons(f.funnel_id as number);
}

export async function unmergeCompany(secondaryId: number) {
  const secondary = await getCompanyById(secondaryId) as Record<string, any> | null;
  if (!secondary)                throw new Error('Secondary company not found');
  if (!secondary.merged_into_id) throw new Error('Company is not merged');

  const primaryId = secondary.merged_into_id as number;

  await withTx(async (client) => {
    await client.query('UPDATE companies SET merged_into_id = NULL WHERE id = $1', [secondaryId]);
    await client.query(
      "DELETE FROM domain_aliases WHERE company_id = $1 AND domain = $2 AND source = 'manual_merge'",
      [primaryId, secondary.domain],
    );

    const rootName = extractRootName(secondary.domain);
    await client.query(
      'UPDATE domain_aliases SET company_id = $1 WHERE company_id = $2 AND root_name = $3',
      [secondaryId, primaryId, rootName],
    );

    const coreRoot = extractCoreRoot(secondary.domain);
    await client.query(
      'INSERT INTO domain_aliases (company_id, domain, root_name, core_root, source, is_canonical) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (domain) DO NOTHING',
      [secondaryId, secondary.domain, rootName, coreRoot, 'unmerge', 1],
    );

    await client.query(
      'INSERT INTO funnel_companies (funnel_id, company_id) SELECT funnel_id, $1 FROM funnel_companies WHERE company_id = $2 ON CONFLICT (funnel_id, company_id) DO NOTHING',
      [secondaryId, primaryId],
    );
  });

  const funnels = await qp(
    'SELECT DISTINCT funnel_id FROM funnel_companies WHERE company_id = $1 OR company_id = $2',
    [primaryId, secondaryId],
  );
  for (const f of funnels) await computeDiscardReasons(f.funnel_id as number);
}

// ── Scrape Cache ───────────────────────────────────────────────────────

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

// ── Stats ──────────────────────────────────────────────────────────────

export async function getDashboardStats(funnelId?: number) {
  let fromClause  = 'FROM companies c';
  let whereClause = '';
  const params: unknown[] = [];

  if (funnelId) {
    fromClause  += ' JOIN funnel_companies fc ON c.id = fc.company_id';
    whereClause  = 'WHERE fc.funnel_id = ?';
    params.push(funnelId);
  }

  const cnt = (extra: string) =>
    qdb(`SELECT COUNT(*) AS c ${fromClause} ${whereClause ? whereClause + ' AND' : 'WHERE'} ${extra}`, params)
      .then((rows: any[]) => Number(rows[0].c));

  const grp = (col: string) =>
    qdb(`SELECT ${col}, COUNT(*) AS count ${fromClause} ${whereClause ? whereClause + ' AND' : 'WHERE'} ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count DESC`, params);

  const [
    total, inApollo, icpYes, icpNo, icpReview, netnew,
    deadDomains, falseNegatives, totalClassified, scrapeSuccess,
    funnelCount, masterIcpCount,
    classBreakdown, catBreakdown, confBreakdown, typeBreakdown, fitBreakdown, discardBreakdown,
  ] = await Promise.all([
    qdb(`SELECT COUNT(*) AS c ${fromClause} ${whereClause || ''}`, params).then((rows: any[]) => Number(rows[0].c)),
    cnt('c.is_in_apollo = 1'),
    cnt("c.icp_decision = 'Yes'"),
    cnt("c.icp_decision = 'No'"),
    cnt("c.icp_decision = 'Review' OR c.icp_decision IS NULL"),
    cnt('c.is_netnew = 1'),
    cnt("c.scrape_status = 'domain_dead'"),
    cnt("c.icp_decision = 'No' AND c.manual_icp = 'Yes'"),
    cnt('c.classified_at IS NOT NULL'),
    cnt("c.scrape_status = 'success'"),
    qp("SELECT COUNT(*) AS c FROM funnels WHERE status = 'active'").then(rows => Number(rows[0].c)),
    getMasterIcpCount(),
    grp('c.company_classification'),
    grp('c.category'),
    grp('c.confidence'),
    grp('c.company_type'),
    grp('c.icp_fit_level'),
    grp('c.discard_reason'),
  ]);

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

// ── Unclassified companies for pipeline ────────────────────────────────

export async function getUnclassifiedCompanies(funnelId: number, limit: number = 10): Promise<Array<Record<string, unknown>>> {
  return qp(`
    SELECT c.* FROM companies c
    JOIN funnel_companies fc ON c.id = fc.company_id
    WHERE fc.funnel_id = $1 AND c.classified_at IS NULL
    ORDER BY c.id LIMIT $2
  `, [funnelId, limit]);
}
