import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { buildFunnelWorkbook } from '@/lib/xlsx-export';
import { uploadXlsxToDrive, driveConfigured, verifyDriveAccess } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Status for the funnel-page "Drive: connected / not set up" indicator.
export async function GET() {
  try {
    return NextResponse.json(await verifyDriveAccess());
  } catch (error) {
    return NextResponse.json({ configured: false, ok: false, error: errorMessage(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const funnelId = body.funnel_id;
    if (!funnelId) {
      return NextResponse.json({ error: 'funnel_id is required' }, { status: 400 });
    }
    if (!driveConfigured()) {
      return NextResponse.json(
        { error: 'Google Drive is not set up yet. Add GOOGLE_SERVICE_ACCOUNT_JSON and GDRIVE_FOLDER_ID to the environment.' },
        { status: 400 },
      );
    }

    const { buffer, funnelName } = await buildFunnelWorkbook(parseInt(funnelId));
    const date = new Date().toISOString().split('T')[0];
    const safeName = funnelName.replace(/[^\w\- ]+/g, '').trim() || 'Funnel';
    const fileName = `${safeName} ${date}.xlsx`;

    const { link } = await uploadXlsxToDrive(fileName, buffer);
    return NextResponse.json({ ok: true, fileName, link });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
