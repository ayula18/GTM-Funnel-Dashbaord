import { qp, qdb } from './core';
import { buildCompanyFilter, FACET_COLUMNS, FUNNEL_STEP_GATES } from './companies';

// ── Funnel Queries ────────────────────────────────────────────────────────

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
      SUM(CASE WHEN c.id IS NOT NULL AND (c.icp_decision = 'Review' OR c.icp_decision IS NULL) THEN 1 ELSE 0 END) AS icp_review,
      SUM(CASE WHEN c.classified_at IS NOT NULL                  THEN 1 ELSE 0 END) AS classified,
      SUM(CASE WHEN c.id IS NOT NULL AND c.classified_at IS NULL THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN c.is_netnew = 1                              THEN 1 ELSE 0 END) AS netnew
    FROM funnels f
    LEFT JOIN funnel_companies fc ON f.id = fc.funnel_id
    LEFT JOIN companies c ON fc.company_id = c.id AND c.merged_into_id IS NULL
    WHERE f.status = 'active'
    GROUP BY f.id
    ORDER BY f.created_at DESC
  `);
}

export async function getFunnel(id: number) {
  const rows = await qp(`
    SELECT f.*,
      COUNT(c.id)                                                        AS total_companies,
      SUM(CASE WHEN c.icp_decision = 'Yes'                       THEN 1 ELSE 0 END) AS icp_yes,
      SUM(CASE WHEN c.icp_decision = 'No'                        THEN 1 ELSE 0 END) AS icp_no,
      SUM(CASE WHEN c.id IS NOT NULL AND (c.icp_decision = 'Review' OR c.icp_decision IS NULL) THEN 1 ELSE 0 END) AS icp_review,
      SUM(CASE WHEN c.classified_at IS NOT NULL                  THEN 1 ELSE 0 END) AS classified,
      SUM(CASE WHEN c.id IS NOT NULL AND c.classified_at IS NULL THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN c.is_netnew = 1                              THEN 1 ELSE 0 END) AS netnew
    FROM funnels f
    LEFT JOIN funnel_companies fc ON f.id = fc.funnel_id
    LEFT JOIN companies c ON fc.company_id = c.id AND c.merged_into_id IS NULL
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

export async function deleteFunnel(id: number) {
  // Delete associated records first to handle cases where ON DELETE CASCADE is not set
  await qp('DELETE FROM funnel_companies WHERE funnel_id = $1', [id]);
  // match_decisions has ON DELETE CASCADE from upload_batches, so deleting upload_batches is enough
  await qp('DELETE FROM upload_batches WHERE funnel_id = $1', [id]);
  // Finally, delete the funnel
  await qp('DELETE FROM funnels WHERE id = $1', [id]);
}

export async function updateFunnelClassification(
  id: number,
  status: string,
  completed: number,
  total: number,
  currentDomain: string
) {
  await qdb(
    `UPDATE funnels SET classification_status = ?, classification_completed = ?, classification_total = ?, classification_current_domain = ?, updated_at = NOW() WHERE id = ?`,
    [status, completed, total, currentDomain, id]
  );
}

export async function updateFunnelClassificationProgress(
  id: number,
  completed: number,
  total: number,
  currentDomain: string
) {
  await qdb(
    `UPDATE funnels SET classification_completed = ?, classification_total = ?, classification_current_domain = ?, updated_at = NOW() WHERE id = ?`,
    [completed, total, currentDomain, id]
  );
}

export async function getFunnelClassificationStatus(id: number) {
  const rows = await qp(
    'SELECT classification_status, classification_completed, classification_total, classification_current_domain FROM funnels WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// ── Funnel Step Counts (with drop counts) ────────────────────────────────────────────────────────

export async function getFunnelSteps(funnelId: number) {
  // Derived from the SAME canonical gates as the per-step table filter
  // (FUNNEL_STEP_GATES), so each badge matches the rows you see on click.
  const g2 = FUNNEL_STEP_GATES[2];
  const g3 = FUNNEL_STEP_GATES[3];
  const g4 = FUNNEL_STEP_GATES[4];
  const g5 = FUNNEL_STEP_GATES[5];

  const [row] = await qp(`
    SELECT
      COUNT(*)                                                                   AS step1_raw,
      COUNT(*) FILTER (WHERE ${g2})                                              AS step2_apollo,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3})                                    AS step3_employees,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4})                          AS step4_icp_total,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1)      AS step4_icp_netnew,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1 AND c.company_classification IN ('DevTool', 'DevTools')) AS step5_netnew_devtool,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1 AND c.company_classification = 'IT Services & Solutions') AS step5_netnew_it,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND c.company_classification = 'IT Services & Solutions') AS step4_services,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND ${g5})               AS step5_funded_total,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND ${g5} AND c.is_netnew = 1) AS step5_funded_netnew
    FROM funnel_companies fc
    JOIN companies c ON fc.company_id = c.id
    WHERE fc.funnel_id = $1 AND c.merged_into_id IS NULL
  `, [funnelId]);

  const n = (v: unknown) => Number(v) || 0;
  const step1_raw          = n(row.step1_raw);
  const step2_apollo       = n(row.step2_apollo);
  const step3_employees    = n(row.step3_employees);
  const step4_icp_total    = n(row.step4_icp_total);
  const step5_funded_total = n(row.step5_funded_total);

  return {
    step1_raw,
    step2_apollo,       step2_drop: step1_raw       - step2_apollo,
    step3_employees,    step3_drop: step2_apollo    - step3_employees,
    step4_icp_total,    step4_icp_netnew: n(row.step4_icp_netnew),
    step5_netnew_devtool: n(row.step5_netnew_devtool),
    step5_netnew_it: n(row.step5_netnew_it),
    step4_services:     n(row.step4_services),
    step4_drop:         step3_employees - step4_icp_total,
    step5_funded_total, step5_funded_netnew: n(row.step5_funded_netnew),
    step5_drop:         step4_icp_total - step5_funded_total,
  };
}

// ── Filter Options (for Excel-like dropdowns) ────────────────────────────────────────────────────────

/**
 * Faceted filter options + counts. Each facet's counts respect the SAME scope
 * as the table (funnel + step + tab + search + every other active filter,
 * merged companies excluded) but exclude that facet's own selection — so the
 * numbers always line up with the rows the user is actually looking at.
 */
export async function getFilterOptions(
  funnelId: number | null,
  filters: Record<string, unknown> = {},
) {
  const getFacet = async (key: string, col: string): Promise<Array<{ value: string; count: number }>> => {
    const { joinClause, whereClause, values } = buildCompanyFilter(funnelId, filters, key);
    const guard = `${col} IS NOT NULL AND ${col} != ''`;
    const sql = `
      SELECT ${col} AS value, COUNT(DISTINCT c.id) AS count
      FROM companies c ${joinClause}
      ${whereClause ? `${whereClause} AND ${guard}` : `WHERE ${guard}`}
      GROUP BY ${col} ORDER BY count DESC`;
    const rows = await qdb(sql, values);
    return rows.map(r => ({ value: r.value as string, count: Number(r.count) }));
  };

  const keys = Object.keys(FACET_COLUMNS);
  const results = await Promise.all(keys.map(k => getFacet(k, FACET_COLUMNS[k])));
  return Object.fromEntries(keys.map((k, i) => [k, results[i]]));
}

// ── Daily Insights ─────────────────────────────────────────────────────────────

export async function getFunnelDailyInsights(funnelId: number) {
  const g2 = FUNNEL_STEP_GATES[2];
  const g3 = FUNNEL_STEP_GATES[3];
  const g4 = FUNNEL_STEP_GATES[4];

  const rows = await qp(`
    SELECT
      DATE(c.created_at) as date,
      COUNT(*) as total_checked,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1 AND c.company_classification IN ('DevTool', 'DevTools')) as icps_devtool,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1 AND c.company_classification = 'IT Services & Solutions') as icps_it
    FROM funnel_companies fc
    JOIN companies c ON fc.company_id = c.id
    WHERE fc.funnel_id = $1 AND c.merged_into_id IS NULL
    GROUP BY DATE(c.created_at)
    ORDER BY DATE(c.created_at) ASC
  `, [funnelId]);

  return rows.map((r: any) => ({
    date: r.date,
    total_checked: Number(r.total_checked),
    icps_devtool: Number(r.icps_devtool),
    icps_it: Number(r.icps_it),
  }));
}
