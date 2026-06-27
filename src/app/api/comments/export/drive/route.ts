import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { buildCommentIntelWorkbook } from '@/lib/xlsx-comments';
import { upsertXlsxToDrive, driveConfigured } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const campaignTag = body.campaign_tag;
    
    if (!campaignTag) {
      return NextResponse.json({ error: 'campaign_tag is required' }, { status: 400 });
    }
    
    // We use a specific env var for comment intel drive exports if provided, otherwise fallback
    const folderEnvVar = process.env.GDRIVE_COMMENT_INTEL_FOLDER_ID ? 'GDRIVE_COMMENT_INTEL_FOLDER_ID' : 'GDRIVE_FOLDER_ID';
    
    if (!driveConfigured(folderEnvVar)) {
      return NextResponse.json(
        { error: `Google Drive is not set up. Missing ${folderEnvVar} or credentials.` },
        { status: 400 },
      );
    }

    const { buffer, fileName } = await buildCommentIntelWorkbook(campaignTag);

    // Upsert means it creates a new file if it doesn't exist, or updates the existing one if it does.
    const { link, updated } = await upsertXlsxToDrive(fileName, buffer, folderEnvVar);
    
    return NextResponse.json({ ok: true, fileName, link, updated });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
