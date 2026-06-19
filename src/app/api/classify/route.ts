import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { processClassificationBatch } from '@/lib/pipeline/runner';
import { getFunnel, updateFunnelClassification } from '@/lib/db';
import { openAIKeys } from '@/lib/openai-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // each call processes a ~45s slice, then returns

/**
 * Client-driven classification. Each POST processes a time-boxed slice of the
 * funnel's unclassified companies and returns progress; the client re-invokes
 * until `done`. No long-lived background task (so it survives serverless), Stop
 * is instant, and a refresh can resume because progress lives in the DB.
 */
export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }

    // Primary key first; the classifier falls over to OPENAI_API_KEY_BACKUP
    // automatically when the primary runs out of credits.
    const apiKey = openAIKeys()[0] || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Set the OPENAI_API_KEY environment variable.' },
        { status: 400 },
      );
    }

    const funnel = await getFunnel(funnel_id);
    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    // Fresh run (not already running): initialise progress = unclassified count.
    if (funnel.classification_status !== 'running') {
      const total = Number(funnel.unclassified) || 0;
      if (total === 0) {
        await updateFunnelClassification(funnel_id, 'idle', 0, 0, '');
        return NextResponse.json({ done: true, stopped: false, completed: 0, total: 0, processedThisCall: 0, errors: [] });
      }
      await updateFunnelClassification(funnel_id, 'running', 0, total, '');
    }

    const result = await processClassificationBatch(funnel_id, apiKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
