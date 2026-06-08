import { buildCategorizationWorkbook } from '@/lib/xlsx-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const funnelIdParam = url.searchParams.get('funnel_id');
    const netNewFilter = url.searchParams.get('net_new') || 'netnew';
    const funnelId = funnelIdParam ? parseInt(funnelIdParam) : null;

    const { buffer } = await buildCategorizationWorkbook(funnelId, netNewFilter);

    const dateStr = new Date().toISOString().split('T')[0];
    const prefix = funnelId ? `funnel_${funnelId}_` : 'all_';
    const filename = `${prefix}categorization_of_icp_companies_${dateStr}.xlsx`;

    return new Response(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error('[Export Categorization]', e);
    return new Response(e.message, { status: 500 });
  }
}
