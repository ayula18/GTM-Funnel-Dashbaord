import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '50');
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * perPage;

    let where = '';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      where = `WHERE domain ILIKE $${paramIdx} OR company_name ILIKE $${paramIdx}`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await qp<{ count: string }>(
      `SELECT COUNT(*) as count FROM customers ${where}`,
      params
    );
    const total = parseInt(countResult[0]?.count || '0');

    const customers = await qp(
      `SELECT * FROM customers ${where} ORDER BY added_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, perPage, offset]
    );

    return NextResponse.json({
      customers,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
