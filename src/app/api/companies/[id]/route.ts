import { NextResponse } from 'next/server';
import { getCompanyById, updateCompany, computeDiscardReasons, qp } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }      = await params;
    const companyId   = parseInt(id);
    const company     = await getCompanyById(companyId);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const mergedCompanies = await qp(
      'SELECT id, domain, company_name FROM companies WHERE merged_into_id = $1',
      [companyId],
    );

    return NextResponse.json({ ...company, merged_companies: mergedCompanies });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }    = await params;
    const companyId = parseInt(id);
    const body      = await request.json();

    if (body.manual_icp === 'Yes') {
      body.discard_reason = null;
      body.discard_step   = null;
    }

    if (body.icp_decision !== undefined) {
      body.needs_manual_review = 0;
      const existing = await getCompanyById(companyId) as Record<string, unknown> | null;
      if (existing && existing.icp_decision !== body.icp_decision) {
        body.manual_icp = body.icp_decision;
      }
    }

    await updateCompany(companyId, body);

    // Recompute discard reasons for all funnels this company is in
    const funnelLinks = await qp('SELECT funnel_id FROM funnel_companies WHERE company_id = $1', [companyId]);
    for (const link of funnelLinks) {
      await computeDiscardReasons(link.funnel_id as number);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
