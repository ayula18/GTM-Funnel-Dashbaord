import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { qp } from '@/lib/db';
import Papa from 'papaparse';
import { normalizeDomain } from '@/lib/domain-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    
    const parsed = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
    });

    const rows = parsed.data as string[][];
    let imported = 0;
    const errors: string[] = [];

    const firstRow = rows[0];
    const hasHeader = firstRow && firstRow.some(cell =>
      /domain|company|name|url|website/i.test(cell)
    );
    const startIdx = hasHeader ? 1 : 0;

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const rawDomain = row[0]?.trim();
      if (!rawDomain || rawDomain.length < 3) continue;

      const domain = normalizeDomain(rawDomain);
      if (!domain || !domain.includes('.')) continue;

      const companyName = row.length > 1 ? row[1]?.trim() : null;

      try {
        await qp(
          `INSERT INTO customers (domain, company_name) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING`,
          [domain, companyName]
        );
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (error) {
    console.error('Customer upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
