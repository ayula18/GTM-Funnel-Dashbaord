export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ensureCommentTables, getProfilesByCampaign, getCommentsByCampaign, getCampaignCommentStats } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await ensureCommentTables();

    const { searchParams } = new URL(request.url);
    const campaign = searchParams.get('campaign');
    const view = searchParams.get('view') || 'profiles'; // profiles | comments | stats

    if (!campaign) {
      return NextResponse.json({ error: 'campaign query param required' }, { status: 400 });
    }

    if (view === 'stats') {
      const stats = await getCampaignCommentStats(campaign);
      return NextResponse.json({ stats });
    }

    if (view === 'comments') {
      const search = searchParams.get('search') || undefined;
      const postId = searchParams.get('post_id') ? parseInt(searchParams.get('post_id')!) : undefined;
      const isReplyParam = searchParams.get('is_reply');
      const isReply = isReplyParam === 'true' ? true : isReplyParam === 'false' ? false : undefined;
      const icpStatus = searchParams.get('icp_status') || undefined;
      const isCustomerParam = searchParams.get('is_customer');
      const isCustomer = isCustomerParam === 'true' ? true : isCustomerParam === 'false' ? false : undefined;
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');

      const { comments, total } = await getCommentsByCampaign(campaign, { search, postId, isReply, icpStatus, isCustomer, limit, offset });
      return NextResponse.json({ comments, total });
    }

    // Default: profiles
    const enrichmentStatus = (searchParams.get('status') as 'all' | 'pending' | 'enriched' | 'icp' | 'non-icp') || 'all';
    const search = searchParams.get('search') || undefined;

    const profiles = await getProfilesByCampaign(campaign, { enrichmentStatus, search });
    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
