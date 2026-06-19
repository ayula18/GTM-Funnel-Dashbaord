import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getCategorizationData } from '@/lib/db/companies';
import { classifyBucket } from '@/lib/bucketing';

export const dynamic = 'force-dynamic';

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
      const { bucket: bucketId, needsReview, reason } = classifyBucket(c);
      if (buckets[bucketId]) {
        buckets[bucketId].push({
          id: c.id,
          company_name: c.company_name,
          domain: c.domain,
          employees: c.employee_reo || c.apollo_employees || c.crunchbase_employees,
          funding: c.total_funding || c.crunchbase_funding,
          revenue: c.revenue_reo || c.annual_revenue,
          sales_team_count: c.sales_team_count,
          website: c.website,
          company_linkedin_url: c.company_linkedin_url,
          funnel_names: c.funnel_names,
          manual_gtm_bucket: c.manual_gtm_bucket,
          manual_gtm_reason: c.manual_gtm_reason,
          needs_review: needsReview,
          bucket_reason: reason,
        });
      }
    }

    return NextResponse.json({ buckets });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
