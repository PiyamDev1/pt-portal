import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    // TODO: send to analytics provider (consider Vercel Web Analytics or Datadog)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Invalid payload' }, { status: 400 })
  }
}
