import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const logs = await qp(`
      SELECT 
        ub.id,
        ub.source_type,
        ub.source_file,
        ub.status,
        ub.total_rows,
        ub.new_companies,
        ub.matched_companies,
        ub.fields_updated,
        ub.skipped_fields,
        ub.created_at,
        COALESCE(ub.chunks_total, 0)    AS chunks_total,
        COALESCE(ub.chunks_done, 0)     AS chunks_done,
        COALESCE(ub.total_file_rows, 0) AS total_file_rows,
        f.name as funnel_name,
        f.id   as funnel_id
      FROM upload_batches ub
      LEFT JOIN funnels f ON ub.funnel_id = f.id
      ORDER BY ub.created_at DESC
      LIMIT 100
    `);

    // In the db, duplicates skipped isn't explicitly stored in upload_batches in v3 schema,
    // but the UI usually implies duplicates = total_rows - new_companies - matched_companies.
    // We can compute that on the fly.
    const enrichedLogs = logs.map(log => ({
      ...log,
      duplicates_skipped: Math.max(0, (log.total_rows as number) - (log.new_companies as number) - (log.matched_companies as number))
    }));

    return NextResponse.json({ logs: enrichedLogs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
