import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Lightweight operational telemetry for booking UX flows.
 * Intentionally best-effort and non-blocking.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = typeof body?.event === 'string' ? body.event : 'unknown';
    const metadata = (body?.metadata && typeof body.metadata === 'object') ? body.metadata : {};

    // Keep this non-fatal and lightweight; logs can be shipped from container stdout.
    console.info('[bookings.telemetry]', {
      event,
      metadata,
      at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
