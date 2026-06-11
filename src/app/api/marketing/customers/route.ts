import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const customers = await qp(`SELECT * FROM customers ORDER BY added_at DESC`);
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
