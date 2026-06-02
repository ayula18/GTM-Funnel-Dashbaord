import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline/runner';
import { getFunnel, qp } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }

    const funnel = await getFunnel(funnel_id) as any;
    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    // Read API key from DB (set via Settings UI), fall back to env var
    let apiKey = process.env.OPENAI_API_KEY || '';
    try {
      const rows = await qp("SELECT value FROM app_settings WHERE key = 'openai_api_key'");
      if (rows[0]?.value) apiKey = rows[0].value as string;
    } catch {
      // DB read failed — use env var if set
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured. Add it in Settings.' }, { status: 400 });
    }

    const unclassifiedCount = funnel.unclassified as number;
    if (unclassifiedCount === 0) {
      return NextResponse.json({ message: 'No unclassified companies left in this funnel.' }, { status: 200 });
    }

    // Start pipeline in background
    // We consume the generator but do not block the request
    (async () => {
      try {
        const generator = runPipeline(funnel_id, apiKey, unclassifiedCount);
        for await (const progress of generator) {
          // just consuming the generator which updates the DB internally
        }
      } catch (e) {
        console.error('Pipeline background error:', e);
      }
    })();

    return NextResponse.json({ success: true, message: 'Classification started' });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
