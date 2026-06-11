export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getEnrichedDomainsForClassification, linkProfileToCompany } from '@/lib/db/comments';
import { qp } from '@/lib/db/core';

export async function POST(request: Request) {
  try {
    const { campaign_tag } = await request.json();
    if (!campaign_tag) {
      return NextResponse.json({ error: 'campaign_tag required' }, { status: 400 });
    }

    // Get all profiles for this campaign that might need syncing
    const domains = await getEnrichedDomainsForClassification(campaign_tag);
    let syncedCount = 0;

    for (const d of domains) {
      const companyRow = await qp<{ id: number; icp_decision: string }>(
        `SELECT id, icp_decision FROM companies WHERE domain = $1 AND icp_decision IS NOT NULL`,
        [d.domain]
      );
      
      if (companyRow.length > 0 && companyRow[0].icp_decision) {
        await linkProfileToCompany(d.profileSlug, companyRow[0].id, companyRow[0].icp_decision);
        syncedCount++;
      }
    }

    return NextResponse.json({ success: true, synced: syncedCount });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
