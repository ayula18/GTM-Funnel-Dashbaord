import { NextResponse } from 'next/server';
import { getCommentsForExport } from '@/lib/db/comments';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaign = searchParams.get('campaign');

    if (!campaign) {
      return new NextResponse('Campaign is required', { status: 400 });
    }

    const records = await getCommentsForExport(campaign);

    if (records.length === 0) {
      return new NextResponse('No data found for this campaign', { status: 404 });
    }

    // Extract headers
    const headers = Object.keys(records[0]);
    
    // Create CSV rows
    const csvRows = [];
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    for (const record of records) {
      const values = headers.map(header => {
        const val = record[header as keyof typeof record];
        const strVal = val === null || val === undefined ? '' : String(val);
        // Escape quotes
        return `"${strVal.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="comment-intel-${campaign.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv"`,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return new NextResponse('Error generating export', { status: 500 });
  }
}
