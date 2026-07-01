import { NextResponse } from 'next/server';
import { qp } from '@/lib/db/core';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const funnelIdStr = searchParams.get('funnelId');
    
    if (!funnelIdStr) {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }
    
    const funnelId = parseInt(funnelIdStr, 10);
    
    // Fetch all companies where icp_decision = 'Yes' for the given funnel
    const companies = await qp(`
      SELECT 
        c.id, 
        c.domain, 
        c.company_name, 
        c.category, 
        c.classification_reason,
        c.audit_is_false_positive,
        c.audit_flag_reason
      FROM companies c
      JOIN funnel_companies fc ON c.id = fc.company_id
      WHERE fc.funnel_id = $1 AND c.icp_decision = 'Yes'
      ORDER BY c.domain ASC
    `, [funnelId]);
    
    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error('Error fetching audit companies:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
