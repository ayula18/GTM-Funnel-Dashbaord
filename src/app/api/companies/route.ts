import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getCompanies } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters: Record<string, unknown> = {};

    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : null;

    // String filters (support comma-separated multi-value)
    [
      'search', 'icp_decision', 'company_classification', 'category',
      'confidence', 'company_country', 'icp_fit_level', 'company_type',
      'scrape_status', 'discard_reason', 'sort_by', 'sort_order', 'manual_icp',
      'funnel_step',
    ].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val;
    });

    // Boolean filters
    ['is_netnew', 'needs_manual_review', 'is_in_apollo', 'is_subsidiary'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val === 'true' || val === '1';
    });

    // Number filters
    [
      'min_employees', 'max_employees', 'min_funding', 'max_funding',
      'min_crunchbase_funding', 'max_crunchbase_funding',
      'min_revenue', 'max_revenue', 'min_founded_year', 'max_founded_year',
      'discard_step', 'page', 'per_page',
    ].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num)) filters[key] = num;
      }
    });

    const result = await getCompanies(parsedFunnelId, filters);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
