import { qp } from '../src/lib/db/core';

async function run() {
  const g2 = "c.is_in_apollo = 1";
  const g3 = "(c.apollo_employees > 1 OR c.employee_reo > 1)";
  const g4 = "(c.icp_decision = 'Yes' OR c.needs_manual_review = 1 OR c.manual_icp = 'Yes')";
  
  const netnewRes = await qp(`
    SELECT
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 1)      AS step4_icp_netnew,
      COUNT(*) FILTER (WHERE ${g2} AND ${g3} AND ${g4} AND c.is_netnew = 0)      AS step4_icp_not_netnew
    FROM funnel_companies fc
    JOIN companies c ON fc.company_id = c.id
    WHERE fc.funnel_id = 9 AND c.merged_into_id IS NULL
  `);
  console.log(netnewRes[0]);
  process.exit(0);
}

run().catch(console.error);
