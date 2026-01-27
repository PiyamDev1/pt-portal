import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    console.log('Payment methods API called')
    console.log('Supabase URL:', url ? 'Set' : 'Missing')
    console.log('Service role key:', key ? 'Set' : 'Missing')
    
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Ensure default payment methods exist in DB (lowercase)
    const defaults = ['cash', 'bank transfer', 'card payment']
    console.log('Fetching existing payment methods...')
    const { data: existing, error: fetchError } = await supabase
      .from('loan_payment_methods')
      .select('id, name')

    if (fetchError) {
      console.error('Error fetching existing methods:', fetchError)
      throw fetchError
    }
    
    console.log('Existing payment methods:', existing)

    // Normalize existing names to lowercase
    if (existing && existing.length > 0) {
      console.log('Normalizing existing methods to lowercase...')
      for (const m of existing) {
        const lower = (m.name || '').toLowerCase()
        if (m.name !== lower) {
          console.log(`Updating "${m.name}" to "${lower}"`)
          const { error: updateErr } = await supabase
            .from('loan_payment_methods')
            .update({ name: lower })
            .eq('id', m.id)
          if (updateErr) {
            console.error('Error updating method:', updateErr)
            throw updateErr
          }
        }
      }
    }

    console.log('Refreshing data after normalization...')
    const { data: refreshedData, error: refreshedErr } = await supabase
      .from('loan_payment_methods')
      .select('name')
    if (refreshedErr) {
      console.error('Error refreshing data:', refreshedErr)
      throw refreshedErr
    }
    console.log('Refreshed data:', refreshedData)

    const existingNames = new Set((refreshedData || []).map(m => (m.name || '').toLowerCase()))
    const toInsert = defaults.filter(n => !existingNames.has(n.toLowerCase())).map(n => ({ name: n }))

    console.log('Methods to insert:', toInsert)
    if (toInsert.length > 0) {
      console.log('Inserting missing methods...')
      const { error: insertError } = await supabase
        .from('loan_payment_methods')
        .upsert(toInsert, { onConflict: 'name' })
      if (insertError) {
        console.error('Error inserting methods:', insertError)
        throw insertError
      }
      console.log('Successfully inserted methods')
    }

    console.log('Fetching final payment methods list...')
    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')
      .order('name')

    if (error) {
      console.error('Supabase error fetching final methods:', error)
      throw error
    }

    console.log('Final payment methods:', methods)
    console.log('Final methods count:', methods?.length || 0)

    return NextResponse.json({ methods })
  } catch (error) {
    console.error('Payment methods API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
