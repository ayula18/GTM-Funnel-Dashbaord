export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getEnrichedDomainsForClassification, linkProfileToCompany } from '@/lib/db/comments';
import { qp } from '@/lib/db/core';

const COMMON_TLDS = ['.com', '.io', '.ai', '.dev', '.co', '.tech', '.cloud', '.app'];
const looksLikeDomain = (s: string) => /\.[a-z]{2,}$/i.test(s) && !s.includes(' ');

/**
 * Resolve an enriched_company_domain value (which may be a company name or
 * an actual domain) to a company row with an ICP decision.
 */
async function resolveToCompany(raw: string): Promise<{ id: number; icp_decision: string } | null> {
  // 1. Direct domain match (case-insensitive)
  const byDomain = await qp<{ id: number; icp_decision: string }>(
    `SELECT id, icp_decision FROM companies
     WHERE LOWER(domain) = LOWER($1) AND icp_decision IS NOT NULL AND merged_into_id IS NULL
     LIMIT 1`,
    [raw],
  );
  if (byDomain.length > 0) return byDomain[0];

  // 2. Company name match
  const byName = await qp<{ id: number; icp_decision: string }>(
    `SELECT id, icp_decision FROM companies
     WHERE LOWER(company_name) = LOWER($1) AND icp_decision IS NOT NULL AND merged_into_id IS NULL
     ORDER BY id ASC LIMIT 1`,
    [raw],
  );
  if (byName.length > 0) return byName[0];

  // 3. TLD guessing (only if it doesn't already look like a domain)
  if (!looksLikeDomain(raw)) {
    const slug = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
    for (const tld of COMMON_TLDS) {
      const candidate = slug + tld;
      const found = await qp<{ id: number; icp_decision: string }>(
        `SELECT id, icp_decision FROM companies
         WHERE LOWER(domain) = $1 AND icp_decision IS NOT NULL AND merged_into_id IS NULL
         LIMIT 1`,
        [candidate],
      );
      if (found.length > 0) return found[0];
    }
  }

  return null;
}

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
      const company = await resolveToCompany(d.domain);
      if (company) {
        await linkProfileToCompany(d.profileSlug, company.id, company.icp_decision);
        syncedCount++;
      }
    }

    return NextResponse.json({ success: true, synced: syncedCount });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
