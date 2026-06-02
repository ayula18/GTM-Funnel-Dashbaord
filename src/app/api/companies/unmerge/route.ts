import { NextResponse } from 'next/server';
import { unmergeCompany } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }

    await unmergeCompany(body.company_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
