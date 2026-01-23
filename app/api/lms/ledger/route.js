import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')

    // 1. Fetch Customer
    const { data: customer } = await supabase.from('loan_customers').select('*').eq('id', customerId).single()

    // 2. Fetch Loans (Services taken - "Debits")
    const { data: loans } = await supabase.from('loans').select('*').eq('loan_customer_id', customerId)

    // 3. Fetch Transactions (Payments made - "Credits")
    // We need transaction IDs from the loans to find the payments
    const loanIds = loans.map(l => l.id)
    const { data: payments } = await supabase
        .from('loan_transactions')
        .select('*')
        .in('loan_id', loanIds)
        .order('transaction_timestamp', { ascending: true })

    // 4. Merge & Calculate Running Balance
    let ledger = []
    
    // Add Loans as "New Service" entries
    loans.forEach(l => {
        ledger.push({
            id: l.id,
            date: l.created_at,
            type: 'SERVICE',
            description: `Service #${l.id.slice(0,6)} (${l.term_months} Months)`,
            amount: l.total_debt_amount,
            isDebit: true // Increases debt
        })
    })

    // Add Payments
    payments.forEach(p => {
        ledger.push({
            id: p.id,
            date: p.transaction_timestamp,
            type: 'PAYMENT',
            description: `Payment via ${p.payment_method_id || 'Cash'}`,
            amount: p.amount,
            isDebit: false // Decreases debt
        })
    })

    // Sort by Date
    ledger.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Calculate Running Balance
    let balance = 0
    ledger = ledger.map(item => {
        if (item.isDebit) balance += item.amount
        else balance -= item.amount
        return { ...item, balance }
    })

    return NextResponse.json({ customer, ledger, balance })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
