import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local' }, { status: 500 })
    }
    const supabase = createClient(url, key)

    const categories = ['nadra', 'passport', 'ticket', 'umrah', 'hotels', 'visa']

    // Normalize existing names to lowercase
    const { data: existing, error: fetchErr } = await supabase
      .from('loan_service_categories')
      .select('id, name')
    if (fetchErr) throw fetchErr

    if (existing && existing.length > 0) {
      for (const c of existing) {
        const lower = (c.name || '').toLowerCase()
        if (c.name !== lower) {
          const { error: updateErr } = await supabase
            .from('loan_service_categories')
            .update({ name: lower })
            .eq('id', c.id)
          if (updateErr) throw updateErr
        }
      }
    }

    // Upsert categories by name (lowercase)
    const toUpsert = categories.map(name => ({ name }))
    const { error } = await supabase
      .from('loan_service_categories')
      .upsert(toUpsert, { onConflict: 'name' })

    if (error) throw error

    const { data } = await supabase
      .from('loan_service_categories')
      .select('id, name')
      .order('name')

    return NextResponse.json({ success: true, categories: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
