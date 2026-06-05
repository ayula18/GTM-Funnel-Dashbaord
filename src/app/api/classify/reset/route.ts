export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { resetFailedClassifications } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { funnel_id } = await request.json();
    if (!funnel_id) {
      return NextResponse.json({ error: 'funnel_id required' }, { status: 400 });
    }
    const count = await resetFailedClassifications(funnel_id);
    return NextResponse.json({ reset: count });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
