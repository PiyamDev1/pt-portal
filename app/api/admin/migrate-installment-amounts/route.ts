import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: Request) {
  try {
    console.log('[MIGRATE-INSTALLMENTS] Starting migration...')

    // Fetch all installments
    const { data: installments, error: fetchError } = await supabase
      .from('loan_installments')
      .select('*')
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('[MIGRATE-INSTALLMENTS] Fetch error:', fetchError)
      throw fetchError
    }

    console.log(`[MIGRATE-INSTALLMENTS] Found ${installments?.length || 0} installments`)

    let updatedPaid = 0
    let updatedSkipped = 0
    let skipped = 0

    for (const inst of installments || []) {
      let shouldUpdate = false
      let newAmount = inst.amount

      // For paid installments, set amount = amount_paid
      if (inst.status === 'paid' && inst.amount_paid > 0) {
        newAmount = inst.amount_paid
        shouldUpdate = true
        updatedPaid++
      }
      // For skipped installments, set amount = 0
      else if (inst.status === 'skipped') {
        newAmount = 0
        shouldUpdate = true
        updatedSkipped++
      } else {
        skipped++
      }

      if (shouldUpdate && newAmount !== inst.amount) {
        const { error: updateError } = await supabase
          .from('loan_installments')
          .update({ amount: newAmount })
          .eq('id', inst.id)

        if (updateError) {
          console.error(`[MIGRATE-INSTALLMENTS] Error updating ${inst.id}:`, updateError)
        } else {
          console.log(`[MIGRATE-INSTALLMENTS] Updated ${inst.id}: ${inst.amount} -> ${newAmount} (${inst.status})`)
        }
      }
    }

    const summary = {
      total: installments?.length || 0,
      updatedPaid,
      updatedSkipped,
      skipped,
      message: `Migration complete: ${updatedPaid} paid installments updated, ${updatedSkipped} skipped installments updated, ${skipped} left unchanged`
    }

    console.log('[MIGRATE-INSTALLMENTS] Summary:', summary)

    return NextResponse.json({
      success: true,
      ...summary
    })

  } catch (error: any) {
    console.error('[MIGRATE-INSTALLMENTS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    )
  }
}
