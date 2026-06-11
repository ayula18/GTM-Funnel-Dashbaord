import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { errorMessage } from '@/lib/utils';
import {
  classifyBucket, detectBucketColumns, rowToBucketInput, BUCKET_META, BucketId,
} from '@/lib/bucketing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Columns appended to the user's sheet.
const OUT_COLS = ['GTM Bucket', 'Qualified', 'Needs Review', 'Bucket Reason'];

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No CSV file uploaded.' }, { status: 400 });
    }

    const text = await (file as File).text();
    const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const rows = (parsed.data as string[][]).filter(r => r && r.length > 0);
    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV has no data rows.' }, { status: 400 });
    }

    const headers = rows[0].map(h => (h ?? '').toString());
    const dataRows = rows.slice(1);

    // Detect which headers feed the bucketing rule.
    const { headerFields, detected } = detectBucketColumns(headers);

    // Build the annotated workbook.
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ICP Dashboard — Raw Classifier';
    wb.created = new Date();
    const ws = wb.addWorksheet('Classified', { views: [{ state: 'frozen', ySplit: 1 }] });

    const outHeaders = [...headers, ...OUT_COLS];
    ws.columns = outHeaders.map(h => ({ header: h, key: h, width: Math.min(40, Math.max(12, h.length + 4)) }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

    const bucketCounts: Record<string, number> = {};
    let qualifiedCount = 0;
    let reviewCount = 0;

    for (const row of dataRows) {
      const input = rowToBucketInput(headerFields, row);
      const { bucket, needsReview, reason } = classifyBucket(input);
      const meta = BUCKET_META[bucket as BucketId];

      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
      if (meta.qualified) qualifiedCount++;
      if (needsReview) reviewCount++;

      // Preserve every original cell, then append the classification.
      const padded = headers.map((_, i) => row[i] ?? '');
      ws.addRow([...padded, meta.label, meta.qualified ? 'Qualified' : 'Not Qualified', needsReview ? 'Yes' : '', reason]);
    }

    if (dataRows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: outHeaders.length } };
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    // Ordered, human-friendly bucket summary.
    const summary = (Object.keys(BUCKET_META) as BucketId[]).map(id => ({
      id,
      label: BUCKET_META[id].label,
      qualified: BUCKET_META[id].qualified,
      count: bucketCounts[id] || 0,
    }));

    return NextResponse.json({
      fileBase64: buffer.toString('base64'),
      fileName: `raw-classified-${new Date().toISOString().slice(0, 10)}.xlsx`,
      total: dataRows.length,
      qualified: qualifiedCount,
      needs_review: reviewCount,
      detected,          // field → original header that fed the rule
      summary,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
