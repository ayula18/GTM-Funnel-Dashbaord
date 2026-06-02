import { NextResponse } from 'next/server';
import { getFunnels, createFunnel } from '@/lib/db';

export async function GET() {
  try {
    const funnels = await getFunnels();
    return NextResponse.json(funnels);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id   = await createFunnel(body.name, body.description);
    return NextResponse.json({ id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
