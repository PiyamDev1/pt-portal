import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Force dynamic so Vercel does not attempt static optimization
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const userId = request.nextUrl?.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('backup_codes')
      .select('id')
      .eq('employee_id', userId)
      .eq('used', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, count: (data || []).length }, { status: 200 })
  } catch (e) {
    console.error('backup-codes count error', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
