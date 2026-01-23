import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'active' // active, overdue, all, settled

    // Fetch all customers with their loan data
    const { data: customers, error: custError } = await supabase
      .from('loan_customers')
      .select(`
        id,
        first_name,
        last_name,
        phone_number,
        email,
        address,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (custError) throw custError

    // Fetch all loans
    const { data: allLoans, error: loansError } = await supabase
      .from('loans')
      .select('*')

    if (loansError) throw loansError

    // Fetch all transactions
    const { data: allTransactions, error: txError } = await supabase
      .from('loan_transactions')
      .select(`
        *,
        loan_payment_methods (name)
      `)

    if (txError) throw txError

    // Build enriched customer accounts
    const accounts = customers.map(customer => {
      const customerLoans = allLoans.filter(l => l.loan_customer_id === customer.id)
      const loanIds = customerLoans.map(l => l.id)
      const transactions = allTransactions.filter(t => loanIds.includes(t.loan_id))

      // Calculate totals
      const services = transactions.filter(t => t.transaction_type === 'Service')
      const payments = transactions.filter(t => t.transaction_type === 'Payment')
      const fees = transactions.filter(t => t.transaction_type === 'Fee')

      const totalServices = services.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
      const totalPayments = payments.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
      const totalFees = fees.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

      const balance = totalServices + totalFees - totalPayments

      // Find next due date from active loans
      const nextDue = customerLoans
        .filter(l => l.next_due_date && l.current_balance > 0)
        .map(l => new Date(l.next_due_date))
        .sort((a, b) => a - b)[0]

      const isOverdue = nextDue && nextDue < new Date() && balance > 0
      const isDueSoon = nextDue && !isOverdue && 
        (nextDue - new Date()) / (1000 * 60 * 60 * 24) <= 7 && balance > 0

      return {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        firstName: customer.first_name,
        lastName: customer.last_name,
        phone: customer.phone_number,
        email: customer.email,
        address: customer.address,
        balance,
        activeLoans: customerLoans.filter(l => l.current_balance > 0).length,
        totalLoans: customerLoans.length,
        nextDue: nextDue?.toISOString(),
        isOverdue,
        isDueSoon,
        lastTransaction: transactions.length > 0 
          ? new Date(Math.max(...transactions.map(t => new Date(t.transaction_timestamp))))
          : null,
        transactions: transactions.sort((a, b) => 
          new Date(b.transaction_timestamp) - new Date(a.transaction_timestamp)
        ),
        loans: customerLoans
      }
    })

    // Apply filters
    let filtered = accounts
    if (filter === 'active') {
      filtered = accounts.filter(a => a.balance > 0)
    } else if (filter === 'overdue') {
      filtered = accounts.filter(a => a.isOverdue)
    } else if (filter === 'settled') {
      filtered = accounts.filter(a => a.balance <= 0 && a.totalLoans > 0)
    }

    // Calculate stats
    const stats = {
      totalOutstanding: accounts.reduce((sum, a) => sum + (a.balance > 0 ? a.balance : 0), 0),
      activeAccounts: accounts.filter(a => a.balance > 0).length,
      overdueAccounts: accounts.filter(a => a.isOverdue).length,
      dueSoonAccounts: accounts.filter(a => a.isDueSoon).length,
      totalAccounts: accounts.filter(a => a.totalLoans > 0).length
    }

    return NextResponse.json({ accounts: filtered, stats, allAccounts: accounts.length })
  } catch (error) {
    console.error('LMS API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Quick Actions
export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { action, customerId, loanId, amount, paymentMethodId, notes, employeeId } = body

    if (action === 'record_payment') {
      // Record payment transaction
      const { error } = await supabase
        .from('loan_transactions')
        .insert({
          loan_id: loanId,
          employee_id: employeeId,
          transaction_type: 'Payment',
          amount: parseFloat(amount),
          payment_method_id: paymentMethodId,
          remark: notes,
          transaction_timestamp: new Date().toISOString()
        })

      if (error) throw error

      // Update loan current_balance
      const { data: loan } = await supabase
        .from('loans')
        .select('current_balance')
        .eq('id', loanId)
        .single()

      await supabase
        .from('loans')
        .update({ 
          current_balance: Math.max(0, loan.current_balance - parseFloat(amount)),
          status: (loan.current_balance - parseFloat(amount)) <= 0 ? 'Settled' : 'Active'
        })
        .eq('id', loanId)

      return NextResponse.json({ success: true })

    } else if (action === 'add_service') {
      const { serviceAmount, termMonths, firstDueDate } = body

      // Create loan
      const { data: newLoan, error: loanError } = await supabase
        .from('loans')
        .insert({
          loan_customer_id: customerId,
          employee_id: employeeId,
          total_debt_amount: parseFloat(serviceAmount),
          current_balance: parseFloat(serviceAmount),
          term_months: parseInt(termMonths),
          next_due_date: firstDueDate,
          status: 'Active'
        })
        .select()
        .single()

      if (loanError) throw loanError

      // Create transaction record
      await supabase
        .from('loan_transactions')
        .insert({
          loan_id: newLoan.id,
          employee_id: employeeId,
          transaction_type: 'Service',
          amount: parseFloat(serviceAmount),
          remark: notes || `New service - ${termMonths} month term`,
          transaction_timestamp: new Date().toISOString()
        })

      return NextResponse.json({ success: true, loanId: newLoan.id })

    } else if (action === 'create_customer') {
      const { firstName, lastName, phone, email, address } = body

      const { data: newCustomer, error } = await supabase
        .from('loan_customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          email,
          address,
          created_by_employee_id: employeeId,
          link_status: 'New Entry'
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, customerId: newCustomer.id })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('LMS Action Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
