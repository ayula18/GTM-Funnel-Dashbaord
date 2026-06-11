import { pool, qp } from '../src/lib/db/core';

async function main() {
  const [row] = await qp(`
    SELECT
      COUNT(*) FILTER (WHERE c.is_in_apollo = 1 AND (COALESCE(c.employee_reo, 0) > 0 OR COALESCE(c.apollo_employees, 0) > 1) AND c.is_netnew = 1) AS step3_netnew,
      COUNT(*) FILTER (WHERE c.is_in_apollo = 1 AND (COALESCE(c.employee_reo, 0) > 0 OR COALESCE(c.apollo_employees, 0) > 1) AND c.icp_decision = 'Yes' AND c.is_netnew = 1) AS step4_netnew_yes,
      COUNT(*) FILTER (WHERE c.is_in_apollo = 1 AND (COALESCE(c.employee_reo, 0) > 0 OR COALESCE(c.apollo_employees, 0) > 1) AND c.icp_decision = 'Yes' AND c.is_netnew = 1 AND c.company_classification IN ('DevTool', 'DevTools')) AS step4_yes_devtool,
      COUNT(*) FILTER (WHERE c.is_in_apollo = 1 AND (COALESCE(c.employee_reo, 0) > 0 OR COALESCE(c.apollo_employees, 0) > 1) AND c.icp_decision = 'Yes' AND c.is_netnew = 1 AND c.company_classification = 'IT Services & Solutions') AS step4_yes_it
    FROM funnel_companies fc
    JOIN companies c ON fc.company_id = c.id
    WHERE c.merged_into_id IS NULL
  `);
  console.log('Stats from all funnels:', row);
  
  process.exit(0);
}

main().catch(console.error);
