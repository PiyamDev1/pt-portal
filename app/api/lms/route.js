import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { ensureInstallmentsTableExists, createInstallmentRecords } from '@/lib/installmentsDb'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local' }, { status: 500 })
    }
    const supabase = createClient(url, key)

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
      const services = transactions.filter(t => (t.transaction_type || '').toLowerCase() === 'service')
      const payments = transactions.filter(t => (t.transaction_type || '').toLowerCase() === 'payment')
      const fees = transactions.filter(t => (t.transaction_type || '').toLowerCase() === 'fee')

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
          ? new Date(Math.max(...transactions.map(t => new Date(t.transaction_timestamp).getTime())))
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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local' }, { status: 500 })
    }
    const supabase = createClient(url, key)

    const body = await request.json()
    const { action, customerId, loanId, amount, paymentMethodId, notes, employeeId } = body

    if (action === 'record_payment') {
      // Record payment transaction
      const { error } = await supabase
        .from('loan_transactions')
        .insert({
          loan_id: loanId,
          employee_id: employeeId,
          transaction_type: 'payment',
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
      const { serviceAmount, initialDeposit, installmentTerms, installmentPlan, paymentFrequency } = body

      // Ensure installments table exists
      await ensureInstallmentsTableExists()

      const totalAmount = parseFloat(serviceAmount)
      const deposit = parseFloat(initialDeposit) || 0
      const remainingAmount = totalAmount - deposit

      console.log(`Adding service: total=${totalAmount}, deposit=${deposit}, remaining=${remainingAmount}`)

      // Create loan
      const { data: newLoan, error: loanError } = await supabase
        .from('loans')
        .insert({
          loan_customer_id: customerId,
          employee_id: employeeId,
          total_debt_amount: totalAmount,
          current_balance: remainingAmount, // Balance after deposit
          term_months: parseInt(installmentTerms),
          next_due_date: installmentPlan?.[0]?.dueDate || new Date().toISOString().split('T')[0],
          status: 'Active'
        })
        .select()
        .single()

      if (loanError) throw loanError

      // Create initial service transaction (full amount) with installment plan summary
      const planSummary = installmentPlan && installmentPlan.length > 0
        ? `Total £${totalAmount.toFixed(2)}, Remaining £${remainingAmount.toFixed(2)}`
        : `New service - ${installmentTerms} installments`
      
      const { data: serviceTransaction, error: serviceTxError } = await supabase
        .from('loan_transactions')
        .insert({
          loan_id: newLoan.id,
          employee_id: employeeId,
          transaction_type: 'service',
          amount: totalAmount,
          remark: notes || planSummary,
          transaction_timestamp: new Date().toISOString()
        })
        .select()
        .single()

      if (serviceTxError) throw serviceTxError

      // Auto-create installment records using utility function
      const numberOfTerms = parseInt(installmentTerms) || 3
      await createInstallmentRecords(
        serviceTransaction.id,
        remainingAmount,
        new Date().toISOString(),
        numberOfTerms
      )

      // If deposit provided, record it as a payment transaction
      if (deposit > 0) {
        const { data: depositTx } = await supabase
          .from('loan_transactions')
          .insert({
            loan_id: newLoan.id,
            employee_id: employeeId,
            transaction_type: 'payment',
            amount: deposit,
            remark: `Initial deposit - Loan #${serviceTransaction.id.substring(0, 8)}`,
            transaction_timestamp: new Date().toISOString()
          })
          .select()
          .single()
      }

      // Create future installment plan transactions (optional - for visibility)
      // Store them as scheduled/pending payments in the installment plan
      // This allows manual entry of payments against them
      // For now, we'll log them as remarks in transaction history
      // The UI will display the installment schedule separately

      return NextResponse.json({ success: true, loanId: newLoan.id })

    } else if (action === 'add_fee') {
      const { loanId, amount, notes, customerId } = body

      const feeAmount = parseFloat(amount)
      if (Number.isNaN(feeAmount) || feeAmount <= 0) {
        return NextResponse.json({ error: 'Valid fee amount required' }, { status: 400 })
      }

      let targetLoanId = loanId || null

      // Find an existing loan for this customer if none provided
      if (!targetLoanId && customerId) {
        const { data: existingLoan } = await supabase
          .from('loans')
          .select('id, current_balance, total_debt_amount')
          .eq('loan_customer_id', customerId)
          .order('created_at', { ascending: false })
          .maybeSingle()

        if (existingLoan) {
          targetLoanId = existingLoan.id
        }
      }

      // If still no loan, create a minimal loan to attach the fee
      if (!targetLoanId && customerId) {
        const { data: newLoan, error: newLoanError } = await supabase
          .from('loans')
          .insert({
            loan_customer_id: customerId,
            employee_id: employeeId,
            total_debt_amount: feeAmount,
            current_balance: feeAmount,
            term_months: 12,
            status: 'Active',
            next_due_date: new Date().toISOString().split('T')[0]
          })
          .select()
          .single()

        if (newLoanError) throw newLoanError
        targetLoanId = newLoan.id
      }

      if (!targetLoanId) {
        return NextResponse.json({ error: 'No loan found or created for fee' }, { status: 400 })
      }

      // Add fee transaction
      await supabase
        .from('loan_transactions')
        .insert({
          loan_id: targetLoanId,
          employee_id: employeeId,
          transaction_type: 'fee',
          amount: feeAmount,
          remark: notes || 'Additional fee',
          transaction_timestamp: new Date().toISOString()
        })

      // Update loan balance
      const { data: loan } = await supabase
        .from('loans')
        .select('current_balance, total_debt_amount')
        .eq('id', targetLoanId)
        .single()

      await supabase
        .from('loans')
        .update({ 
          current_balance: (loan?.current_balance || 0) + feeAmount,
          total_debt_amount: (loan?.total_debt_amount || 0) + feeAmount
        })
        .eq('id', targetLoanId)

      return NextResponse.json({ success: true, loanId: targetLoanId })

    } else if (action === 'create_customer') {
      const { firstName, lastName, phone, email, address, initialTransaction } = body

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

      // If initial transaction provided, create loan and transaction
      if (initialTransaction && initialTransaction.amount) {
        const txType = initialTransaction.type
        const txAmount = parseFloat(initialTransaction.amount)

        if (txType === 'service' || txType === 'fee') {
          // Create loan for debt
          const { data: newLoan, error: loanError } = await supabase
            .from('loans')
            .insert({
              loan_customer_id: newCustomer.id,
              employee_id: employeeId,
              total_debt_amount: txAmount,
              current_balance: txAmount,
              term_months: 12, // Default
              status: 'Active'
            })
            .select()
            .single()

          if (loanError) throw loanError

          // Create transaction
          await supabase
            .from('loan_transactions')
            .insert({
              loan_id: newLoan.id,
              employee_id: employeeId,
              transaction_type: txType === 'service' ? 'service' : 'fee',
              amount: txAmount,
              remark: initialTransaction.notes || 'Initial transaction',
              transaction_timestamp: new Date().toISOString()
            })
        } else if (txType === 'payment') {
          // Cannot add payment without a loan - need to create a dummy loan first
          // OR skip payment-only for initial transaction
          // For now, we'll skip pure payment as it doesn't make sense without debt
        }
      }

      return NextResponse.json({ success: true, customerId: newCustomer.id })
    
    } else if (action === 'update_customer') {
      const { customerId, phone, email, address, dateOfBirth, notes } = body

      const { error } = await supabase
        .from('loan_customers')
        .update({
          phone_number: phone,
          email,
          address,
          date_of_birth: dateOfBirth,
          notes
        })
        .eq('id', customerId)

      if (error) throw error

      return NextResponse.json({ success: true })
    
    } else if (action === 'delete_customer') {
      const { customerId, authCode, userId } = body

      if (!authCode) {
        return NextResponse.json({ error: 'Auth code required' }, { status: 403 })
      }

      // Get customer data for logging before deletion
      const { data: customerData } = await supabase
        .from('loan_customers')
        .select('*')
        .eq('id', customerId)
        .single()

      if (!customerData) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }

      // Log deletion (similar to NADRA)
      await supabase.from('deletion_logs').insert({
        record_type: 'LMS Customer',
        deleted_record_data: customerData,
        deleted_by: userId || null,
        auth_code_used: authCode
      })

      // First, delete all transactions associated with customer's loans
      const { data: customerLoans } = await supabase
        .from('loans')
        .select('id')
        .eq('loan_customer_id', customerId)

      if (customerLoans && customerLoans.length > 0) {
        const loanIds = customerLoans.map(l => l.id)
        
        // Delete transactions
        await supabase
          .from('loan_transactions')
          .delete()
          .in('loan_id', loanIds)

        // Delete loans
        await supabase
          .from('loans')
          .delete()
          .eq('loan_customer_id', customerId)
      }

      // Finally delete customer
      const { error } = await supabase
        .from('loan_customers')
        .delete()
        .eq('id', customerId)

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('LMS Action Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
