import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// Force dynamic to prevent caching issues
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()

    // FIX: Use standard URL parsing. request.nextUrl causes the 500 crash.
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('backup_codes')
      .select('id')
      .eq('employee_id', userId)
      .eq('used', false)

    if (error) {
      // Gracefully handle if table doesn't exist yet
      if (error.code === '42P01') return NextResponse.json({ count: 0 }, { status: 200 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: (data || []).length }, { status: 200 })
  } catch (e) {
    console.error('backup-codes count error:', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
