import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { parseAndImportCsv, parseMasterIcpCsv } from '@/lib/csv-parser';
import { createFunnel, computeDiscardReasons } from '@/lib/db';
import { CsvSourceType } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const formData          = await request.formData();
    const file              = formData.get('file') as File;
    const type              = formData.get('type') as string;
    const funnelName        = formData.get('funnel_name') as string;
    const funnelIdStr       = formData.get('funnel_id') as string;
    const sourceTypeOverride = formData.get('source_type') as CsvSourceType | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    if (type === 'master_icp') {
      const result = await parseMasterIcpCsv(text);
      return NextResponse.json(result);
    }

    if (!funnelName && !funnelIdStr) {
      return NextResponse.json({ error: 'Must provide funnel_name or funnel_id' }, { status: 400 });
    }

    let fId: number;
    let fName: string;

    if (funnelIdStr) {
      fId   = parseInt(funnelIdStr);
      fName = funnelName || 'Existing Funnel';
    } else {
      fId   = await createFunnel(funnelName);
      fName = funnelName;
    }

    const result = await parseAndImportCsv(text, fId, fName, sourceTypeOverride || undefined, file.name);

    await computeDiscardReasons(fId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
