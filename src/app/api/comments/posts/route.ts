export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ensureCommentTables, createPost, getPostsByCampaign, deletePost, getAllCampaignTags } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await ensureCommentTables();

    const { searchParams } = new URL(request.url);
    const campaign = searchParams.get('campaign');

    if (campaign) {
      const posts = await getPostsByCampaign(campaign);
      return NextResponse.json({ posts });
    }

    // No campaign specified — return all campaign tags
    const tags = await getAllCampaignTags();
    return NextResponse.json({ campaigns: tags });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCommentTables();

    const body = await request.json();
    const { campaign_tag, post_url, post_title } = body;

    if (!campaign_tag || !post_url) {
      return NextResponse.json({ error: 'campaign_tag and post_url required' }, { status: 400 });
    }

    const post = await createPost(campaign_tag, post_url, post_title);
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('id');

    if (!postId) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await deletePost(parseInt(postId));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
