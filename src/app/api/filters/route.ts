import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getFilterOptions } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : null;

    // Mirror /api/companies scope params so facet counts match the table.
    const filters: Record<string, unknown> = {};

    [
      'search', 'icp_decision', 'company_classification', 'category',
      'confidence', 'company_country', 'icp_fit_level', 'company_type',
      'scrape_status', 'discard_reason', 'manual_icp', 'funnel_step',
    ].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val;
    });

    ['is_netnew', 'needs_manual_review', 'is_in_apollo', 'is_subsidiary'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val === 'true' || val === '1';
    });

    [
      'min_employees', 'max_employees', 'min_funding', 'max_funding',
      'min_crunchbase_funding', 'max_crunchbase_funding',
      'min_revenue', 'max_revenue', 'min_founded_year', 'max_founded_year',
      'discard_step',
    ].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num)) filters[key] = num;
      }
    });

    const options = await getFilterOptions(parsedFunnelId, filters);
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
