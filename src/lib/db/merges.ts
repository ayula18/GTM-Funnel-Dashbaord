import { qp, qdb, withTx } from './core';
import { extractRootName, extractCoreRoot, normalizeCompanyName, isJunkName } from '../domain-utils';
import { getCompanyById, computeDiscardReasons } from './companies';

// ── Domain Alias Resolution ────────────────────────────────────────────────────────

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

  // P6: Company name (exact normalized) — skip junk/placeholder names
  if (companyName && !isJunkName(companyName)) {
    const normalizedName = normalizeCompanyName(companyName);
    if (normalizedName && normalizedName.length >= 3) {
      const candidates = await qp(
        "SELECT id, domain, company_name FROM companies WHERE company_name IS NOT NULL AND company_name != '' AND domain != $1",
        [domain],
      );
      for (const c of candidates) {
        if (isJunkName(c.company_name as string)) continue;
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

// ── Merge Candidates ────────────────────────────────────────────────────────

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
      c1.subsidiary_of AS subsidiary_1,
      c2.domain AS domain_2, c2.company_name AS name_2, c2.company_linkedin_url AS linkedin_2,
      c2.apollo_employees AS employees_2, c2.total_funding AS funding_2,
      c2.icp_decision AS icp_2, c2.company_classification AS classification_2,
      c2.category AS category_2, c2.company_country AS country_2, c2.website AS website_2,
      c2.subsidiary_of AS subsidiary_2
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

/**
 * Scan a funnel for duplicate companies that import-time matching did not
 * already unify, and queue them as merge candidates for human review.
 *
 * Strategy: bucket companies by a shared key, then only flag pairs that land
 * in the same bucket. This is near-linear (vs the old O(n²) all-pairs scan)
 * and — crucially — junk/placeholder keys ("Unknown", empty roots, etc.) are
 * excluded so they can never form a key. Each unordered pair is emitted once,
 * with the strongest signal that found it.
 *
 *   Priority (strongest first):
 *     root_name    → 'high'   (same domain root: splunk.com ↔ splunk.io)
 *     core_root    → 'medium' (marketing-prefix variant: trytruffle.ai ↔ truffle.com)
 *     linkedin_url → 'medium' (same LinkedIn company slug)
 *     company_name → 'low'    (same distinctive, non-junk name)
 */
export async function scanForDuplicates(funnelId: number): Promise<number> {
  const companies = await qp(`
    SELECT c.id, c.domain, c.company_name, c.company_linkedin_url
    FROM companies c JOIN funnel_companies fc ON c.id = fc.company_id
    WHERE fc.funnel_id = $1 AND c.merged_into_id IS NULL
  `, [funnelId]);

  // Gather every company's domain roots from its aliases.
  const aliasMap = new Map<number, { rootNames: Set<string>; coreRoots: Set<string> }>();
  for (const c of companies) {
    const aliases = await qp('SELECT root_name, core_root FROM domain_aliases WHERE company_id = $1', [c.id]);
    aliasMap.set(c.id as number, {
      rootNames: new Set(aliases.map(a => a.root_name as string).filter(r => r && r.length >= 3)),
      coreRoots: new Set(aliases.map(a => a.core_root as string).filter(r => r && r.length >= 3)),
    });
  }

  // ── Build buckets keyed by each signal ──────────────────────────────────
  const rootBuckets     = new Map<string, number[]>();
  const coreBuckets     = new Map<string, number[]>();
  const linkedinBuckets = new Map<string, number[]>();
  const nameBuckets     = new Map<string, number[]>();

  const push = (bucket: Map<string, number[]>, key: string, id: number) => {
    const arr = bucket.get(key);
    if (arr) arr.push(id); else bucket.set(key, [id]);
  };

  for (const c of companies) {
    const id = c.id as number;
    const a = aliasMap.get(id)!;
    for (const r of a.rootNames) push(rootBuckets, r, id);
    for (const r of a.coreRoots) push(coreBuckets, r, id);

    const li = (c.company_linkedin_url as string | null) || '';
    if (li.toLowerCase().includes('linkedin.com/company/')) {
      const slug = li.toLowerCase().replace(/\/+$/, '').split('linkedin.com/company/')[1]?.split('/')[0] || '';
      if (slug.length >= 2) push(linkedinBuckets, slug, id);
    }

    const name = c.company_name as string | null;
    if (!isJunkName(name)) push(nameBuckets, normalizeCompanyName(name as string), id);
  }

  // ── Emit one candidate per unordered pair, strongest signal wins ─────────
  const found = new Set<string>();
  const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

  const emit = async (
    bucket: Map<string, number[]>,
    matchType: string,
    confidence: string,
    detail: (key: string) => string,
  ) => {
    for (const [key, ids] of bucket) {
      const uniq = [...new Set(ids)];
      if (uniq.length < 2) continue;
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const pk = pairKey(uniq[i], uniq[j]);
          if (found.has(pk)) continue;
          found.add(pk);
          await createMergeCandidate(uniq[i], uniq[j], matchType, detail(key), confidence);
        }
      }
    }
  };

  await emit(rootBuckets,     'root_name',    'high',   k => `Shared domain root: ${k}`);
  await emit(coreBuckets,     'core_root',    'medium', k => `Shared core root: ${k}`);
  await emit(linkedinBuckets, 'linkedin_url', 'medium', k => `Same LinkedIn: ${k}`);
  await emit(nameBuckets,     'company_name', 'low',    k => `Same company name: ${k}`);

  return found.size;
}

// ── Merging Companies ────────────────────────────────────────────────────────

export async function mergeCompanies(primaryId: number, secondaryId: number) {
  const primary   = await getCompanyById(primaryId);
  const secondary = await getCompanyById(secondaryId);

  if (!primary || !secondary) throw new Error('Company not found');
  const secondaryDomain = secondary.domain as string;

  await withTx(async (client) => {
    // 1. Move domain aliases
    await client.query('UPDATE domain_aliases SET company_id = $1 WHERE company_id = $2', [primaryId, secondaryId]);

    // 2. Add secondary domain as alias for primary
    const coreRoot = extractCoreRoot(secondaryDomain);
    const rootName = extractRootName(secondaryDomain);
    await client.query(
      'INSERT INTO domain_aliases (company_id, domain, root_name, core_root, source, is_canonical) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (domain) DO NOTHING',
      [primaryId, secondaryDomain, rootName, coreRoot, 'manual_merge', 0],
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
    const updates: Record<string, unknown> = {};
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
  const secondary = await getCompanyById(secondaryId);
  if (!secondary)                throw new Error('Secondary company not found');
  if (!secondary.merged_into_id) throw new Error('Company is not merged');

  const primaryId = secondary.merged_into_id as number;
  const secondaryDomain = secondary.domain as string;

  await withTx(async (client) => {
    await client.query('UPDATE companies SET merged_into_id = NULL WHERE id = $1', [secondaryId]);
    await client.query(
      "DELETE FROM domain_aliases WHERE company_id = $1 AND domain = $2 AND source = 'manual_merge'",
      [primaryId, secondaryDomain],
    );

    const rootName = extractRootName(secondaryDomain);
    await client.query(
      'UPDATE domain_aliases SET company_id = $1 WHERE company_id = $2 AND root_name = $3',
      [secondaryId, primaryId, rootName],
    );

    const coreRoot = extractCoreRoot(secondaryDomain);
    await client.query(
      'INSERT INTO domain_aliases (company_id, domain, root_name, core_root, source, is_canonical) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (domain) DO NOTHING',
      [secondaryId, secondaryDomain, rootName, coreRoot, 'unmerge', 1],
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
