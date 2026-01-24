import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Ensure default payment methods exist in DB
    const defaults = ['Cash', 'Bank Transfer', 'Card Payment']
    const { data: existing, error: fetchError } = await supabase
      .from('loan_payment_methods')
      .select('id, name')

    if (fetchError) throw fetchError

    const existingNames = new Set((existing || []).map(m => (m.name || '').toLowerCase()))
    const toInsert = defaults.filter(n => !existingNames.has(n.toLowerCase())).map(n => ({ name: n }))

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('loan_payment_methods')
        .upsert(toInsert, { onConflict: 'name' })
      if (insertError) throw insertError
    }

    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')
      .order('name')

    if (error) throw error

    return NextResponse.json({ methods })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
