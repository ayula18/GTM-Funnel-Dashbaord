export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import {
  ensureCommentTables,
  getEnrichedDomainsForClassification,
  linkProfileToCompany,
} from '@/lib/db/comments';
import { upsertCompanyTracked, linkCompanyToFunnel } from '@/lib/db/companies';
import { findCompanyByDomainSmart } from '@/lib/db/merges';
import { processClassificationBatch } from '@/lib/pipeline/runner';
import { updateFunnelClassification } from '@/lib/db/funnels';
import { qp } from '@/lib/db/core';

/**
 * POST /api/comments/classify
 *
 * Takes enriched domains from Comment Intel profiles, upserts them into
 * the main `companies` table (the SAME table the GTM Engine uses), creates
 * or finds a funnel for the campaign, and runs the EXISTING ICP classification
 * pipeline. This means the exact same scraper + LLM classifier that powers
 * the GTM Dashboard is reused here — no duplication.
 *
 * After classification, each profile's icp_status is updated from the
 * company's icp_decision.
 */
export async function POST(request: Request) {
  try {
    await ensureCommentTables();

    const { campaign_tag } = await request.json();
    if (!campaign_tag) {
      return NextResponse.json({ error: 'campaign_tag required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env.local.' },
        { status: 400 },
      );
    }

    // 1. Get all enriched but unclassified domains from this campaign's profiles
    const domains = await getEnrichedDomainsForClassification(campaign_tag);

    if (domains.length === 0) {
      return NextResponse.json({
        message: 'No unclassified enriched domains found. Either all profiles are already classified, or none have been enriched with domains yet.',
      });
    }

    // 2. Find or create a funnel for this campaign's comment intel
    const funnelName = `Comment Intel: ${campaign_tag}`;
    const funnelRows = await qp<{ id: number }>(`SELECT id FROM funnels WHERE name = $1`, [funnelName]);
    let funnelId: number;

    if (funnelRows.length === 0) {
      const created = await qp<{ id: number }>(
        `INSERT INTO funnels (name, description, status) VALUES ($1, $2, 'active') RETURNING id`,
        [funnelName, `Auto-created funnel for Comment Intel campaign: ${campaign_tag}`]
      );
      funnelId = created[0].id;
    } else {
      funnelId = funnelRows[0].id;
    }

    // 3. Upsert each enriched domain into the companies table and link to funnel
    //
    // IMPORTANT: enriched_company_domain from the CSV often contains company
    // NAMES ("MoEngage") rather than actual domains ("moengage.com").
    // We must resolve these to existing companies before creating new ones.
    const profileSlugByDomain: Record<string, string[]> = {};
    let insertedCount = 0;
    const looksLikeDomain = (s: string) => /\.[a-z]{2,}$/i.test(s) && !s.includes(' ');
    const COMMON_TLDS = ['.com', '.io', '.ai', '.dev', '.co', '.tech', '.cloud', '.app'];

    for (const d of domains) {
      const raw = d.domain.trim();
      let companyId: number | null = null;

      // --- Step A: If it already looks like a domain, do the normal lookup ---
      if (looksLikeDomain(raw)) {
        const lowerDomain = raw.toLowerCase();
        const smartMatch = await findCompanyByDomainSmart(lowerDomain, d.companyName || undefined, undefined);
        if (smartMatch && (smartMatch.confidence === 'exact' || smartMatch.confidence === 'high')) {
          companyId = smartMatch.id;
        } else {
          const result = await upsertCompanyTracked(
            { domain: lowerDomain, company_name: d.companyName || null },
            { source: 'raw_domains' },
          );
          companyId = result.id;
          insertedCount++;
        }
      } else {
        // --- Step B: It's a company NAME, not a domain. Resolve it. ---

        // B1. Try exact company_name match in the DB
        const nameMatch = await qp<{ id: number; domain: string; icp_decision: string | null }>(
          `SELECT id, domain, icp_decision FROM companies
           WHERE LOWER(company_name) = LOWER($1) AND merged_into_id IS NULL
           ORDER BY icp_decision IS NOT NULL DESC, id ASC LIMIT 1`,
          [raw],
        );
        if (nameMatch.length > 0) {
          companyId = nameMatch[0].id;
        }

        // B2. Try common TLD guesses: "MoEngage" → "moengage.com"
        if (!companyId) {
          const slug = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
          for (const tld of COMMON_TLDS) {
            const candidate = slug + tld;
            const found = await qp<{ id: number }>(
              `SELECT id FROM companies WHERE LOWER(domain) = $1 AND merged_into_id IS NULL LIMIT 1`,
              [candidate],
            );
            if (found.length > 0) {
              companyId = found[0].id;
              break;
            }
          }
        }

        // B3. Still nothing? Create with the best domain we can construct.
        if (!companyId) {
          const slug = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
          const constructedDomain = slug + '.com'; // best guess
          const result = await upsertCompanyTracked(
            { domain: constructedDomain, company_name: raw },
            { source: 'raw_domains' },
          );
          companyId = result.id;
          insertedCount++;
        }
      }

      await linkCompanyToFunnel(companyId, funnelId);

      // Immediately link profile if company already has an ICP decision
      const decision = await qp<{ icp_decision: string }>(
        `SELECT icp_decision FROM companies WHERE id = $1 AND icp_decision IS NOT NULL`,
        [companyId],
      );
      if (decision.length > 0 && decision[0].icp_decision) {
        await linkProfileToCompany(d.profileSlug, companyId, decision[0].icp_decision);
      }

      // Track which profile slugs map to each domain
      if (!profileSlugByDomain[d.domain]) profileSlugByDomain[d.domain] = [];
      profileSlugByDomain[d.domain].push(d.profileSlug);
    }

    // 4. Run the existing classification pipeline on the funnel
    const funnelRow = await qp<{ unclassified: number }>(
      `SELECT COUNT(*) AS unclassified FROM funnel_companies fc
       JOIN companies c ON c.id = fc.company_id
       WHERE fc.funnel_id = $1 AND c.icp_decision IS NULL`,
      [funnelId]
    );
    const unclassifiedCount = parseInt(String(funnelRow[0]?.unclassified || '0'));

    if (unclassifiedCount > 0) {
      // Set the funnel to running state so the client loop can pick it up
      await updateFunnelClassification(funnelId, 'running', 0, unclassifiedCount, '');
    }

    return NextResponse.json({
      success: true,
      domains_found: domains.length,
      companies_inserted: insertedCount,
      funnel_id: funnelId,
      funnel_name: funnelName,
      unclassified_to_process: unclassifiedCount,
      message: `Classification pipeline started for ${unclassifiedCount} companies. Results will sync back to profiles automatically.`,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
