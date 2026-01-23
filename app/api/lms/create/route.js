import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { customerId, customerDetails, loanAmount, termMonths, firstDueDate, currentUserId } = body

    let finalCustomerId = customerId

    // 1. Create Customer if needed
    if (!finalCustomerId) {
      const { data: newCust, error: custErr } = await supabase
        .from('loan_customers')
        .insert({
          first_name: customerDetails.firstName,
          last_name: customerDetails.lastName,
          phone_number: customerDetails.phone,
          email: customerDetails.email,
          address: customerDetails.address,
          created_by_employee_id: currentUserId,
          link_status: 'New Entry'
        })
        .select('id')
        .single()

      if (custErr) throw custErr
      finalCustomerId = newCust.id
    }

    // 2. Create Loan
    const { error: loanErr } = await supabase
      .from('loans')
      .insert({
        loan_customer_id: finalCustomerId,
        employee_id: currentUserId,
        total_debt_amount: parseFloat(loanAmount),
        current_balance: parseFloat(loanAmount), // Starts equal to total debt
        term_months: parseInt(termMonths),
        next_due_date: firstDueDate,
        status: 'Active'
      })

    if (loanErr) throw loanErr

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("LMS Create Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
