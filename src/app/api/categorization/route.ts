import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getCategorizationData } from '@/lib/db/companies';
import { Company } from '@/lib/types';

export const dynamic = 'force-dynamic';

function getBucketId(company: any): string {
  if (company.manual_gtm_bucket) {
    return company.manual_gtm_bucket;
  }

  const isDevTool = company.company_classification === 'DevTool' || company.company_classification === 'DevTools';
  const isITServices = company.company_classification === 'IT Services & Solutions';
  const categoryStr = (company.category || '') + ' ' + (company.sub_category || '');
  const isApiSdk = categoryStr.toLowerCase().includes('api') || categoryStr.toLowerCase().includes('sdk');

  const employees = company.employee_reo || company.apollo_employees || 0;
  
  // Use crunchbase funding if total_funding is null
  let funding = company.total_funding || 0;
  if (!funding && company.crunchbase_funding) funding = company.crunchbase_funding;
  
  let revenue = company.revenue_reo || company.annual_revenue || 0;

  const salesTeam = company.sales_team_count;

  if (!isDevTool) {
    if (isITServices || isApiSdk) {
      return 'future_icp';
    }
    return 'irrelevant'; // Shouldn't happen often if we filter by icp_decision = 'Yes'
  }

  if (employees >= 500) return 'enterprise';
  if (employees >= 200) return 'commercial';

  // < 200 Employees: Distinguish SMB, Startup, Immature
  // Primary Logic: Sales Team Count
  if (salesTeam !== null && salesTeam !== undefined) {
    if (salesTeam >= 2) return 'smb';
    if (salesTeam === 1 || (salesTeam === 0 && (funding >= 5000000 || revenue >= 3000000))) return 'startup';
    if (salesTeam === 0 && funding < 5000000 && revenue < 3000000) return 'immature';
  }

  // Fallback Logic: Employee Count Proxy
  if (employees >= 50) return 'smb';
  
  if (funding >= 5000000 || revenue >= 3000000) return 'startup';
  if (funding > 0 || revenue > 0) return 'immature'; // If we have some data but it's below threshold

  // If no employee count or funding data is truly known to place it safely
  return 'unclassified';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const funnelIdParam = url.searchParams.get('funnel_id');
    const netNewFilter = url.searchParams.get('net_new') || 'netnew';
    const funnelId = funnelIdParam ? parseInt(funnelIdParam) : null;

    const companies = await getCategorizationData(funnelId, netNewFilter);

    // Initialize buckets structure
    const buckets: Record<string, any[]> = {
      enterprise: [],
      commercial: [],
      smb: [],
      startup: [],
      immature: [],
      future_icp: [],
      irrelevant: [],
      unclassified: [],
    };

    for (const c of companies as any[]) {
      const bucketId = getBucketId(c);
      if (buckets[bucketId]) {
        buckets[bucketId].push({
          id: c.id,
          company_name: c.company_name,
          domain: c.domain,
          employees: c.employee_reo || c.apollo_employees,
          funding: c.total_funding || c.crunchbase_funding,
          revenue: c.revenue_reo || c.annual_revenue,
          sales_team_count: c.sales_team_count,
          website: c.website,
          company_linkedin_url: c.company_linkedin_url,
          funnel_names: c.funnel_names,
          manual_gtm_bucket: c.manual_gtm_bucket,
          manual_gtm_reason: c.manual_gtm_reason
        });
      }
    }

    return NextResponse.json({ buckets });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
