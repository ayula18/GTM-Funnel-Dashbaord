import { NextResponse } from 'next/server';
import { qp } from '@/lib/db/core';

export async function POST(request: Request) {
  try {
    const { companyIds } = await request.json();
    
    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json({ error: 'Array of companyIds is required' }, { status: 400 });
    }

    // Using unnest for bulk update to avoid creating too many parameterized statements
    await qp(`
      UPDATE companies
      SET 
        icp_decision = 'No',
        company_classification = 'Not Relevant',
        icp_fit_level = 'Not a Fit',
        classification_reason = 'Flagged as false positive by ICP Auditor. Original reason: ' || classification_reason
      WHERE id IN (SELECT unnest($1::int[]))
    `, [companyIds]);
    
    return NextResponse.json({ success: true, count: companyIds.length });
  } catch (error: any) {
    console.error('Error rejecting audited companies:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
