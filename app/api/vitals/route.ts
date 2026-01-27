import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    // TODO: send to analytics provider; temporarily log minimal info
    console.error('[WebVitals]', data?.name, {
      value: data?.value,
      id: data?.id,
      label: data?.label,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Invalid payload' }, { status: 400 })
  }
}
