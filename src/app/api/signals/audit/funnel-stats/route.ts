import { NextResponse } from 'next/server';
import { qp } from '@/lib/db/core';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const funnels = await qp(`
      SELECT 
        f.id, 
        f.name, 
        f.description as source,
        COUNT(c.id) FILTER (WHERE c.icp_decision = 'Yes') as icp_yes_count,
        COUNT(c.id) FILTER (WHERE c.icp_decision = 'Yes' AND c.audit_is_false_positive IS NOT NULL) as audited_count,
        COUNT(c.id) FILTER (WHERE c.icp_decision = 'Yes' AND c.audit_is_false_positive = true) as false_positives_count
      FROM funnels f
      LEFT JOIN funnel_companies fc ON f.id = fc.funnel_id
      LEFT JOIN companies c ON fc.company_id = c.id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);
    
    // Parse bigints/strings to numbers if necessary
    const mapped = funnels.map((f: any) => ({
      id: f.id,
      name: f.name,
      source: f.source,
      icp_yes_count: Number(f.icp_yes_count) || 0,
      audited_count: Number(f.audited_count) || 0,
      false_positives_count: Number(f.false_positives_count) || 0
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Error fetching funnel stats:', error);
    return NextResponse.json({ error: 'Failed to fetch funnel stats' }, { status: 500 });
  }
}
