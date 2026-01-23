import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 1. Fetch all active loans with customer details
    const { data: loans, error } = await supabase
      .from('loans')
      .select(`
        id,
        current_balance,
        total_debt_amount,
        status,
        loan_customer:loan_customer_id (
          id,
          first_name,
          last_name,
          phone_number
        )
      `)
      .gt('current_balance', 0) // Only fetch if they owe money

    if (error) throw error

    // 2. Group by Customer
    const customerMap = {}

    loans.forEach(loan => {
        const cust = loan.loan_customer
        if (!cust) return

        if (!customerMap[cust.id]) {
            customerMap[cust.id] = {
                id: cust.id,
                name: `${cust.first_name} ${cust.last_name}`,
                phone: cust.phone_number,
                totalBalance: 0,
                activeLoans: 0
            }
        }
        
        customerMap[cust.id].totalBalance += loan.current_balance
        customerMap[cust.id].activeLoans += 1
    })

    const customers = Object.values(customerMap).sort((a, b) => b.totalBalance - a.totalBalance)

    // Stats
    const stats = {
        totalReceivables: customers.reduce((sum, c) => sum + c.totalBalance, 0),
        activeCustomers: customers.length
    }

    return NextResponse.json({ customers, stats })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
