import { qp, qdb } from './core';
import { computeDiscardReasons } from './companies';

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

// ── Filter Options (for Excel-like dropdowns) ────────────────────────────────────────────────────────

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
