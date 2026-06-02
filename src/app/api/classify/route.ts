import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { runPipeline } from '@/lib/pipeline/runner';
import { getFunnel } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }

    const funnel = await getFunnel(funnel_id);
    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    // API key comes from the environment (set OPENAI_API_KEY locally in
    // .env.local and in the Vercel project's environment variables).
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Set the OPENAI_API_KEY environment variable.' },
        { status: 400 },
      );
    }

    const unclassifiedCount = funnel.unclassified as number;
    if (unclassifiedCount === 0) {
      return NextResponse.json({ message: 'No unclassified companies left in this funnel.' }, { status: 200 });
    }

    // Start pipeline in background
    // We consume the generator but do not block the request
    (async () => {
      try {
        // Drain the generator (it updates the DB internally) without binding.
        const generator = runPipeline(funnel_id, apiKey, unclassifiedCount);
        for (let next = await generator.next(); !next.done; next = await generator.next()) {
          // side effects only
        }
      } catch (e) {
        console.error('Pipeline background error:', e);
      }
    })();

    return NextResponse.json({ success: true, message: 'Classification started' });

  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
