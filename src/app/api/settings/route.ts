import { NextResponse } from 'next/server';
import { qp } from '@/lib/db';

export async function GET() {
  try {
    const rows = await qp('SELECT key, value FROM app_settings');
    const settings = Object.fromEntries(rows.map(r => [r.key as string, r.value]));
    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      await qp(
        'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
        [key, String(value)],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
