export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ensureCommentTables, ingestScrape } from '@/lib/db';
import { extractProfiles } from '@/lib/linkedin-scraper';
import { parseHeadline } from '@/lib/headline-parser';

export async function POST(request: Request) {
  try {
    await ensureCommentTables();

    const body = await request.json();
    const { post_id, html } = body;

    if (!post_id || !html) {
      return NextResponse.json({ error: 'post_id and html required' }, { status: 400 });
    }

    // Extract profiles from pasted HTML
    const raw = extractProfiles(html);

    if (raw.length === 0) {
      return NextResponse.json({
        error: 'No profiles found. Make sure you copied the comments container outerHTML.',
      }, { status: 400 });
    }

    // Parse headlines to extract company + designation
    const enriched = raw.map(p => {
      const { company, designation } = parseHeadline(p.headline);
      return {
        slug: p.slug,
        name: p.name,
        headline: p.headline,
        url: p.url,
        comment: p.comment,
        is_reply: p.isReply,
        parsed_company: company || undefined,
        parsed_designation: designation || undefined,
      };
    });

    // Persist to DB with dedup
    const result = await ingestScrape(post_id, enriched);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
