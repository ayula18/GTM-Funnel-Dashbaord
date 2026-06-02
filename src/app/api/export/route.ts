import { NextResponse } from 'next/server';
import { getCompanies } from '@/lib/db';
import Papa from 'papaparse';

export async function GET(request: Request) {
  try {
    const url            = new URL(request.url);
    const filters: Record<string, any> = {};

    const funnelId       = url.searchParams.get('funnel_id');
    const parsedFunnelId = funnelId ? parseInt(funnelId) : null;

    // String filters
    ['search', 'icp_decision', 'company_classification', 'category', 'confidence', 'company_country', 'icp_fit_level', 'company_type', 'scrape_status'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val;
    });

    // Boolean filters
    ['is_netnew', 'needs_manual_review'].forEach(key => {
      const val = url.searchParams.get(key);
      if (val !== null && val !== '') filters[key] = val === 'true' || val === '1';
    });

    // Number filters
    ['min_employees', 'max_employees', 'min_funding', 'max_funding', 'min_revenue', 'max_revenue'].forEach(key => {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
