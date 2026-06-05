export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getMasterIcpCount, clearMasterIcp } from '@/lib/db/master';

export async function GET() {
  try {
    const total = await getMasterIcpCount();
    return NextResponse.json({ total });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearMasterIcp();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
