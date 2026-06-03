import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { parseAndImportCsv, parseMasterIcpCsv } from '@/lib/csv-parser';
import { createFunnel, computeDiscardReasons } from '@/lib/db';
import { CsvSourceType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // large imports can run for minutes

export async function POST(request: Request) {
  try {
    const formData          = await request.formData();
    const file              = formData.get('file') as File;
    const type              = formData.get('type') as string;
    const funnelName        = formData.get('funnel_name') as string;
    const funnelIdStr       = formData.get('funnel_id') as string;
    const sourceTypeOverride = formData.get('source_type') as CsvSourceType | null;
    const mappingJson        = formData.get('column_mapping') as string | null;

    let manualMapping: Record<string, string> | null = null;
    if (mappingJson) {
      try {
        const parsed = JSON.parse(mappingJson);
        if (parsed && typeof parsed === 'object') manualMapping = parsed as Record<string, string>;
      } catch {
        return NextResponse.json({ error: 'Invalid column_mapping JSON' }, { status: 400 });
      }
    }

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

    const fileName = file.name;

    // Stream progress as NDJSON: one {type:"progress"} line per processed chunk,
    // then a final {type:"done", result} (or {type:"error"}). The client renders
    // a live % so a multi-minute import never looks hung.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch { /* closed */ }
        };
        try {
          let fId: number;
          let fName: string;
          if (funnelIdStr) {
            fId   = parseInt(funnelIdStr);
            fName = funnelName || 'Existing Funnel';
          } else {
            fId   = await createFunnel(funnelName);
            fName = funnelName;
          }

          const result = await parseAndImportCsv(
            text, fId, fName, sourceTypeOverride || undefined, fileName, manualMapping,
            (processed, total) => send({ type: 'progress', processed, total }),
          );

          send({ type: 'progress', processed: result.total_rows, total: result.total_rows, phase: 'finalizing' });
          await computeDiscardReasons(fId);

          send({ type: 'done', result });
        } catch (error) {
          console.error('Upload error:', error);
          send({ type: 'error', error: errorMessage(error) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type':     'application/x-ndjson; charset=utf-8',
        'Cache-Control':    'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
