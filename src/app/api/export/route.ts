export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getCompanies } from '@/lib/db';
import Papa from 'papaparse';

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const filters: Record<string, unknown> = {};

    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : null;

    // String filters
    ['search', 'icp_decision', 'company_classification', 'category', 'confidence', 'company_country', 'icp_fit_level', 'company_type', 'scrape_status', 'discard_reason', 'manual_icp', 'funnel_step'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val;
    });

    // Boolean filters
    ['is_netnew', 'needs_manual_review', 'is_in_apollo', 'is_subsidiary'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val === 'true' || val === '1';
    });

    // Number filters
    ['min_employees', 'max_employees', 'min_funding', 'max_funding', 'min_crunchbase_funding', 'max_crunchbase_funding', 'min_revenue', 'max_revenue', 'min_founded_year', 'max_founded_year', 'discard_step'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num)) filters[key] = num;
      }
    });

    // Fetch all for export
    filters.page     = 1;
    filters.per_page = 100000;
    filters.sort_by    = url.searchParams.get('sort_by')    || 'c.id';
    filters.sort_order = url.searchParams.get('sort_order') || 'asc';

    const result = await getCompanies(parsedFunnelId, filters);

    const csvData = Papa.unparse(result.data, {
      header:         true,
      skipEmptyLines: true,
    });

    return new NextResponse(csvData, {
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="icp_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
