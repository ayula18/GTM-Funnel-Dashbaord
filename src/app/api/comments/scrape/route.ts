export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ensureCommentTables, ingestScrape } from '@/lib/db';
import { extractProfiles, extractReactions } from '@/lib/linkedin-scraper';
import { parseHeadline } from '@/lib/headline-parser';

export async function POST(request: Request) {
  try {
    await ensureCommentTables();

    const body = await request.json();
    const { post_id, html } = body;

    if (!post_id || !html) {
      return NextResponse.json({ error: 'post_id and html required' }, { status: 400 });
    }

    // Extract profiles from pasted HTML (comments)
    const rawComments = extractProfiles(html);
    // Extract reactions from pasted HTML
    const rawReactions = extractReactions(html);

    if (rawComments.length === 0 && rawReactions.length === 0) {
      return NextResponse.json({
        error: 'No comments or reactions found. Make sure you copied the correct HTML container.',
      }, { status: 400 });
    }

    // Parse headlines to extract company + designation (for comments)
    const enrichedComments = rawComments.map(p => {
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

    const enrichedReactions = rawReactions.map(r => ({
      slug: r.slug,
      name: r.name,
      url: r.url,
      reaction_type: r.reactionType,
    }));

    // Persist to DB with dedup
    const result = await ingestScrape(post_id, enrichedComments, enrichedReactions);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
