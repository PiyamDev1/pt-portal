import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { ensureInstallmentsTableExists, createInstallmentRecords, createDetailedInstallmentRecords } from '@/lib/installmentsDb'

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
    const accountId = searchParams.get('accountId') // If provided, return this account regardless of filter
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Max 100, default 50
    const offset = (page - 1) * limit

    // Fetch customers with pagination
    const { data: customers, error: custError, count: totalCount } = await supabase
      .from('loan_customers')
      .select(`
        id,
        first_name,
        last_name,
        phone_number,
        email,
        address,
        created_at
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (custError) throw custError

    const customerIds = customers.map(c => c.id)

    // Only fetch loans/transactions/installments for the customers on this page
    const { data: allLoans, error: loansError } = await supabase
      .from('loans')
      .select('*')
      .in('loan_customer_id', customerIds)

    if (loansError) throw loansError

    const loanIds = allLoans.map(l => l.id)

    // Fetch transactions only for loans on this page
    const { data: allTransactions, error: txError } = await supabase
      .from('loan_transactions')
      .select(`
        *,
        loan_payment_methods (name)
      `)
      .in('loan_id', loanIds.length > 0 ? loanIds : ['00000000-0000-0000-0000-000000000000'])

    if (txError) throw txError

    // Fetch installments only for transactions on this page
    const transactionIds = allTransactions.map(t => t.id)
    const { data: allInstallments, error: installmentsError } = await supabase
      .from('loan_installments')
      .select('*')
      .in('loan_transaction_id', transactionIds.length > 0 ? transactionIds : ['00000000-0000-0000-0000-000000000000'])

    if (installmentsError) throw installmentsError

    // Build lookup maps for O(1) access
    const loansMap = new Map()
    const transactionsMap = new Map()
    const installmentsMap = new Map()

    // Map loans by customer ID for fast lookup
    allLoans.forEach(loan => {
      if (!loansMap.has(loan.loan_customer_id)) {
        loansMap.set(loan.loan_customer_id, [])
      }
      loansMap.get(loan.loan_customer_id).push(loan)
    })

    // Map transactions by loan ID for fast lookup
    allTransactions.forEach(tx => {
      if (!transactionsMap.has(tx.loan_id)) {
        transactionsMap.set(tx.loan_id, [])
      }
      transactionsMap.get(tx.loan_id).push(tx)
    })

    // Map installments by transaction ID for fast lookup
    allInstallments.forEach(inst => {
      if (!installmentsMap.has(inst.loan_transaction_id)) {
        installmentsMap.set(inst.loan_transaction_id, [])
      }
      installmentsMap.get(inst.loan_transaction_id).push(inst)
    })

    // Build enriched customer accounts
    const accounts = customers.map(customer => {
      const customerLoans = loansMap.get(customer.id) || []
      const loanIds = customerLoans.map(l => l.id)
      
      // Collect all transactions for this customer's loans
      const transactions = []
      loanIds.forEach(loanId => {
        const loanTxs = transactionsMap.get(loanId) || []
        transactions.push(...loanTxs)
      })

      // Calculate totals (single pass)
      let totalServices = 0
      let totalPayments = 0
      let totalFees = 0
      const services = []
      const payments = []
      const fees = []

      transactions.forEach(t => {
        const txType = (t.transaction_type || '').toLowerCase()
        const amount = parseFloat(t.amount || 0)
        
        if (txType === 'service') {
          totalServices += amount
          services.push(t)
        } else if (txType === 'payment') {
          totalPayments += amount
          payments.push(t)
        } else if (txType === 'fee') {
          totalFees += amount
          fees.push(t)
        }
      })

      const balance = totalServices + totalFees - totalPayments

      // Calculate next due date
      let nextDue = null
      
      if (balance > 0) {
        const dueDates = []
        
        // Get service transaction dates and their installments
        services.forEach(service => {
          const serviceInstallments = installmentsMap.get(service.id) || []
          
          if (serviceInstallments.length > 0) {
            // Has installment plan - use installment due dates
            serviceInstallments.forEach(inst => {
              if (inst.status !== 'paid' && inst.status !== 'skipped') {
                dueDates.push(new Date(inst.due_date))
              }
            })
          } else {
            // No installment plan - use service transaction date as due date
            dueDates.push(new Date(service.transaction_timestamp))
          }
        })
        
        // Add fee dates (fees are due immediately)
        fees.forEach(fee => {
          dueDates.push(new Date(fee.transaction_timestamp))
        })
        
        // Get earliest date
        if (dueDates.length > 0) {
          nextDue = new Date(Math.min(...dueDates.map(d => d.getTime())))
        }
      }

      const now = new Date()
      const isOverdue = nextDue && nextDue < now && balance > 0
      const isDueSoon = nextDue && !isOverdue && 
        (nextDue - now) / (1000 * 60 * 60 * 24) <= 7 && balance > 0

      // Count active services
      let activeServicesCount = 0
      services.forEach(service => {
        const serviceInstallments = installmentsMap.get(service.id) || []
        
        if (serviceInstallments.length > 0) {
          // Has installments - check if any are unpaid
          if (serviceInstallments.some(inst => inst.status !== 'paid' && inst.status !== 'skipped')) {
            activeServicesCount++
          }
        } else {
          // No installments - check if service amount hasn't been fully paid
          const servicePaid = payments.reduce((sum, p) => {
            // Match payments by date proximity (within 1 day of service)
            const dayDiff = Math.abs((new Date(service.transaction_timestamp) - new Date(p.transaction_timestamp)) / (1000 * 60 * 60 * 24))
            return dayDiff <= 1 ? sum + parseFloat(p.amount || 0) : sum
          }, 0)
          if (servicePaid < parseFloat(service.amount || 0)) {
            activeServicesCount++
          }
        }
      })

      // Get last transaction date
      let lastTransaction = null
      if (transactions.length > 0) {
        const timestamps = transactions.map(t => new Date(t.transaction_timestamp).getTime())
        lastTransaction = new Date(Math.max(...timestamps))
      }

      // Sort transactions by date descending
      const sortedTransactions = transactions.sort((a, b) => 
        new Date(b.transaction_timestamp) - new Date(a.transaction_timestamp)
      )

      return {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        firstName: customer.first_name,
        lastName: customer.last_name,
        phone: customer.phone_number,
        email: customer.email,
        address: customer.address,
        balance,
        activeLoans: activeServicesCount,
        totalLoans: customerLoans.length,
        nextDue: nextDue?.toISOString(),
        isOverdue,
        isDueSoon,
        lastTransaction,
        transactions: sortedTransactions,
        loans: customerLoans
      }
    })

    // Calculate stats only from current page for quick response
    const stats = {
      totalOutstanding: accounts.reduce((sum, a) => sum + a.balance, 0),
      activeAccounts: accounts.filter(a => a.balance > 0).length,
      overdueAccounts: accounts.filter(a => a.isOverdue).length,
      dueSoonAccounts: accounts.filter(a => a.isDueSoon).length,
      totalAccounts: accounts.filter(a => a.totalLoans > 0).length
    }

    // Apply filters
    let filtered = accounts
    
    // If accountId is provided, return that account regardless of filter status
    if (accountId) {
      filtered = accounts.filter(a => a.id === accountId)
    } else if (filter === 'active') {
      filtered = accounts.filter(a => a.balance > 0)
    } else if (filter === 'overdue') {
      filtered = accounts.filter(a => a.isOverdue)
    } else if (filter === 'settled') {
      filtered = accounts.filter(a => a.balance <= 0 && a.totalLoans > 0)
    }

    return NextResponse.json({ 
      accounts: filtered, 
      stats,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        pages: Math.ceil((totalCount || 0) / limit)
      }
    })
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
      const { serviceAmount, initialDeposit, installmentTerms, installmentPlan, paymentFrequency, transactionDate } = body

      // Ensure installments table exists
      await ensureInstallmentsTableExists()

      const totalAmount = parseFloat(serviceAmount)
      const deposit = parseFloat(initialDeposit) || 0
      const remainingAmount = totalAmount - deposit
      
      // Use provided transaction date or default to now
      const txTimestamp = transactionDate ? new Date(transactionDate).toISOString() : new Date().toISOString()

      console.log(`Adding service: total=${totalAmount}, deposit=${deposit}, remaining=${remainingAmount}, date=${txTimestamp}`)

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
      const planSummary = notes || (
        installmentPlan && installmentPlan.length > 0
          ? `${installmentPlan.length} installments - ${paymentFrequency || 'monthly'}`
          : `${installmentTerms} installments`
      )
      
      const { data: serviceTransaction, error: serviceTxError } = await supabase
        .from('loan_transactions')
        .insert({
          loan_id: newLoan.id,
          employee_id: employeeId,
          transaction_type: 'service',
          amount: totalAmount,
          remark: notes || planSummary,
          transaction_timestamp: txTimestamp
        })
        .select()
        .single()

      if (serviceTxError) throw serviceTxError

      // Auto-create installment records using detailed plan from frontend
      try {
        if (installmentPlan && installmentPlan.length > 0) {
          // Use the detailed plan provided from frontend
          console.log('Creating installment plan with', installmentPlan.length, 'installments')
          await createDetailedInstallmentRecords(
            serviceTransaction.id,
            installmentPlan,
            paymentFrequency
          )
        } else {
          // Fallback to simple generation
          const numberOfTerms = parseInt(installmentTerms) || 3
          console.log('Creating fallback installment plan with', numberOfTerms, 'terms')
          await createInstallmentRecords(
            serviceTransaction.id,
            remainingAmount,
            new Date().toISOString(),
            numberOfTerms
          )
        }
      } catch (installmentError) {
        console.error('Error creating installments (continuing without them):', installmentError)
        // Don't throw - allow the service creation to succeed even if installments fail
      }

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
            transaction_timestamp: txTimestamp
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
