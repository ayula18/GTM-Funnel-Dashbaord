import { NextResponse } from 'next/server';
import { qp } from '@/lib/db/core';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '50');
    const search = searchParams.get('search') || '';

    let query = 'SELECT * FROM master_icp';
    let countQuery = 'SELECT COUNT(*) as count FROM master_icp';
    const params: string[] = [];

    if (search) {
      query += ' WHERE domain ILIKE $1 OR company_name ILIKE $1';
      countQuery += ' WHERE domain ILIKE $1 OR company_name ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY added_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const [countResult, rows] = await Promise.all([
      qp(countQuery, params),
      qp(query, [...params, perPage, (page - 1) * perPage])
    ]);

    return NextResponse.json({
      data: rows,
      pagination: {
        total: Number(countResult[0].count),
        page,
        per_page: perPage,
        totalPages: Math.ceil(Number(countResult[0].count) / perPage)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
