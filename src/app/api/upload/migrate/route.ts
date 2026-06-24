import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/upload/migrate
 *
 * One-shot idempotent migration that adds the resumable-upload tracking
 * columns to upload_batches. Safe to call multiple times — uses
 * ADD COLUMN IF NOT EXISTS so it is a no-op after the first run.
 *
 * Hit this endpoint once after deploying the resumable-upload feature.
 */
export async function GET() {
  try {
    await qp(`
      ALTER TABLE upload_batches
        ADD COLUMN IF NOT EXISTS chunks_total    INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS chunks_done     INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_file_rows INTEGER DEFAULT 0
    `);

    return NextResponse.json({ ok: true, message: 'Migration applied (idempotent).' });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
