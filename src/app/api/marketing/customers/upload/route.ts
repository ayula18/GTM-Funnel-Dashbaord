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
    if (!firstRow) return NextResponse.json({ imported: 0, errors: ['Empty CSV'] });

    // Detect column indices based on header text
    let domainIdx = -1;
    let nameIdx = -1;
    const hasHeader = firstRow.some(cell => /domain|company|name|url|website|account/i.test(cell));

    if (hasHeader) {
      firstRow.forEach((cell, idx) => {
        const text = cell.toLowerCase().trim();
        if (text.includes('domain') || text.includes('website') || text.includes('url')) {
          if (domainIdx === -1) domainIdx = idx;
        } else if (text.includes('company') || text.includes('name') || text.includes('account')) {
          if (nameIdx === -1) nameIdx = idx;
        }
      });
    }

    // Fallbacks if no matching headers found
    if (domainIdx === -1) domainIdx = 0; // Default Domain to col A
    if (nameIdx === -1) nameIdx = domainIdx === 0 ? 1 : 0; // Default Name to col B

    const startIdx = hasHeader ? 1 : 0;

    const domainsToInsert: string[] = [];
    const namesToInsert: (string | null)[] = [];

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const rawDomain = row[domainIdx]?.trim();
      if (!rawDomain || rawDomain.length < 3) continue;

      const domain = normalizeDomain(rawDomain);
      if (!domain || !domain.includes('.')) continue;

      const companyName = row[nameIdx] ? row[nameIdx].trim() : null;

      domainsToInsert.push(domain);
      namesToInsert.push(companyName);
    }

    // Bulk insert using UNNEST for extreme performance and reliability
    imported = 0;
    const chunkSize = 2000;
    
    for (let i = 0; i < domainsToInsert.length; i += chunkSize) {
      const dChunk = domainsToInsert.slice(i, i + chunkSize);
      const nChunk = namesToInsert.slice(i, i + chunkSize);
      
      try {
        await qp(
          `INSERT INTO customers (domain, company_name) 
           SELECT * FROM UNNEST($1::text[], $2::text[])
           ON CONFLICT (domain) DO UPDATE SET 
             company_name = EXCLUDED.company_name,
             added_at = NOW()`,
          [dChunk, nChunk]
        );
        imported += dChunk.length;
      } catch (err) {
        errors.push(`Batch insert failed: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (error) {
    console.error('Customer upload error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
