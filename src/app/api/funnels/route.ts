import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getFunnels, createFunnel } from '@/lib/db';

// Reads no request params, so Next would otherwise STATICALLY cache this at
// build time and serve a frozen funnel list until the next deploy. Force it
// dynamic so every request reflects the live DB.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const funnels = await getFunnels();
    return NextResponse.json(funnels);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id   = await createFunnel(body.name, body.description);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
