import { NextResponse } from 'next/server';
import { pushToMaster, getMasterIcpCount } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { company_ids } = await request.json();
    if (!company_ids || !Array.isArray(company_ids) || company_ids.length === 0) {
      return NextResponse.json({ error: 'company_ids required' }, { status: 400 });
    }
    await pushToMaster(company_ids);
    const count = await getMasterIcpCount();
    return NextResponse.json({ pushed: company_ids.length, total_master: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const count = await getMasterIcpCount();
    return NextResponse.json({ total: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
