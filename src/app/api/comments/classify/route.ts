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
    const profileSlugByDomain: Record<string, string[]> = {};
    let insertedCount = 0;

    for (const d of domains) {
      // Check if company already exists
      const smartMatch = await findCompanyByDomainSmart(d.domain, d.companyName || undefined, undefined);

      let companyId: number;
      if (smartMatch && smartMatch.confidence === 'exact') {
        companyId = smartMatch.id;
      } else {
        const companyData: Record<string, unknown> = {
          domain: d.domain,
          company_name: d.companyName || null,
        };
        // Domain-only inserts from Comment Intel — treat as raw domains (owns no
        // enrichment columns, so identity fields like company_name fill cleanly).
        const result = await upsertCompanyTracked(companyData, { source: 'raw_domains' });
        companyId = result.id;
        insertedCount++;
      }

      await linkCompanyToFunnel(companyId, funnelId);

      // Track which profile slugs map to each domain
      const profileRow = await qp<{ slug: string }>(`SELECT slug FROM linkedin_profiles WHERE id = $1`, [d.profileId]);
      if (profileRow.length > 0) {
        if (!profileSlugByDomain[d.domain]) profileSlugByDomain[d.domain] = [];
        profileSlugByDomain[d.domain].push(profileRow[0].slug);
      }
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
      // Run the classification in the background, using the same time-boxed,
      // attempt-marking batch processor as the GTM pipeline (so it can't loop
      // forever on a failure). Note: like any background task this is best-effort
      // on serverless; the Comment Intel page can re-trigger if interrupted.
      (async () => {
        try {
          await updateFunnelClassification(funnelId, 'running', 0, unclassifiedCount, '');
          let result = await processClassificationBatch(funnelId, apiKey);
          while (!result.done) {
            result = await processClassificationBatch(funnelId, apiKey);
          }

          // After pipeline completes, sync ICP status back to linkedin_profiles
          for (const [domain, slugs] of Object.entries(profileSlugByDomain)) {
            const companyRow = await qp<{ id: number; icp_decision: string }>(
              `SELECT id, icp_decision FROM companies WHERE domain = $1`,
              [domain]
            );
            if (companyRow.length > 0 && companyRow[0].icp_decision) {
              for (const slug of slugs) {
                await linkProfileToCompany(slug, companyRow[0].id, companyRow[0].icp_decision);
              }
            }
          }
        } catch (e) {
          console.error('Comment Intel classification pipeline error:', e);
        }
      })();
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
