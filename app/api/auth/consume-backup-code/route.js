import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { userId, code } = await request.json()
    if (!userId || !code) return NextResponse.json({ error: 'userId and code required' }, { status: 400 })

    const { data: rows, error } = await supabaseAdmin
      .from('backup_codes')
      .select('*')
      .eq('employee_id', userId)

    if (error) {
      console.error('Failed to fetch backup codes', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const r of (rows || [])) {
      const match = await bcrypt.compare(code, r.code_hash)
      if (match && !r.used) {
        // mark used
        await supabaseAdmin.from('backup_codes').update({ used: true }).eq('id', r.id)
        return NextResponse.json({ success: true }, { status: 200 })
      }
    }

    return NextResponse.json({ error: 'Invalid or used backup code' }, { status: 400 })
  } catch (e) {
    console.error('consume-backup-code error', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
