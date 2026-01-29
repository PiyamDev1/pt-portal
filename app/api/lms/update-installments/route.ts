import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: Request) {
  try {
    const { installments } = await request.json()

    if (!installments || !Array.isArray(installments)) {
      return NextResponse.json(
        { error: 'Invalid installments data' },
        { status: 400 }
      )
    }

    console.log('[UPDATE-INSTALLMENTS] Updating installments:', installments)

    // Update each installment
    const updates = []
    for (const installment of installments) {
      const { id, due_date, amount } = installment

      if (!id || !due_date || !amount) {
        console.error('[UPDATE-INSTALLMENTS] Invalid installment:', installment)
        continue
      }

      const { error } = await supabase
        .from('loan_installments')
        .update({
          due_date,
          amount: parseFloat(amount)
        })
        .eq('id', id)

      if (error) {
        console.error('[UPDATE-INSTALLMENTS] Error updating installment:', id, error)
        throw error
      }

      updates.push(id)
    }

    console.log('[UPDATE-INSTALLMENTS] Successfully updated:', updates)

    return NextResponse.json({
      success: true,
      message: `Updated ${updates.length} installment(s)`,
      updated: updates
    })

  } catch (error: any) {
    console.error('[UPDATE-INSTALLMENTS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update installments' },
      { status: 500 }
    )
  }
}
