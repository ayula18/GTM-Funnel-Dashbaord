import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/utils';
import { getFunnel, getFunnelSteps, updateFunnel } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }    = await params;
    const funnelId  = parseInt(id);

    const funnel = await getFunnel(funnelId);
    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    const steps = await getFunnelSteps(funnelId);

    return NextResponse.json({ ...funnel, steps });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }   = await params;
    const funnelId = parseInt(id);
    const body     = await request.json();

    await updateFunnel(funnelId, body);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }   = await params;
    const funnelId = parseInt(id);

    await updateFunnel(funnelId, { status: 'archived' });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
