import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 1. Fetch Active Loans with Customer Data
    const { data: loans, error } = await supabase
      .from('loans')
      .select(`
        id,
        total_debt_amount,
        current_balance,
        term_months,
        next_due_date,
        status,
        loan_customers (
          first_name,
          last_name,
          phone_number
        )
      `)
      .neq('status', 'Settled') // Hide completely settled loans from main view
      .order('next_due_date', { ascending: true }) // Urgent first

    if (error) throw error

    // 2. Calculate Dashboard Stats
    const stats = {
        activeCount: loans.length,
        totalReceivables: loans.reduce((sum, l) => sum + (l.current_balance || 0), 0),
        overdueCount: loans.filter(l => {
            if (!l.next_due_date) return false
            return new Date(l.next_due_date) < new Date() && l.current_balance > 0
        }).length
    }

    return NextResponse.json({ loans, stats })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
