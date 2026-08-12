/**
 * API Route: Loan Management System (LMS) - Account Listing
 *
 * GET  /api/lms
 *   Returns paginated loan accounts with their latest transaction details.
 *   Query params:
 *     filter     string  - 'active' | 'overdue' | 'all' | 'settled' (default: 'active')
 *     accountId  string  - Return a single account regardless of filter
 *     page       number  - Page number (default: 1)
 *     limit      number  - Page size (max: 100, default: 50)
 *
 * POST /api/lms
 *   Creates a new loan account with optional installment plan.
 *   Body: { employeeId, amount, serviceType, startDate, installmentCount?, ... }
 *
 * DELETE /api/lms
 *   Marks a loan account as settled/deleted.
 *   Body: { accountId }
 *
 * Authentication: Service role key
 * Response Errors: 500 Supabase not configured | 400 Validation | 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import {
  getLmsIdempotencyKey,
  requireLmsStaff,
  verifyLmsDestructiveAction,
} from '@/lib/lms/apiAuth'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const numericInput = z.union([z.number(), z.string().trim().min(1)])
const installmentPlanItemSchema = z
  .object({
    dueDate: z.string().trim().min(1),
    amount: numericInput,
  })
  .passthrough()
const initialTransactionSchema = z
  .object({
    type: z.enum(['service', 'fee', 'payment']),
    amount: numericInput,
    paymentMethodId: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough()
const lmsActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('record_payment'),
      loanId: z.string().optional(),
      amount: numericInput.optional(),
      paymentMethodId: z.string().optional().nullable(),
      notes: z.string().optional(),
      transactionDate: z.string().optional(),
      idempotencyKey: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal('add_service'),
      customerId: z.string().optional(),
      serviceAmount: numericInput.optional(),
      initialDeposit: numericInput.optional(),
      installmentTerms: numericInput.optional(),
      installmentPlan: z.array(installmentPlanItemSchema).optional(),
      paymentFrequency: z.string().optional(),
      notes: z.string().optional(),
      transactionDate: z.string().optional(),
      idempotencyKey: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal('add_fee'),
      customerId: z.string().optional(),
      loanId: z.string().optional(),
      amount: numericInput.optional(),
      notes: z.string().optional(),
      transactionDate: z.string().optional(),
      idempotencyKey: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal('create_customer'),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      initialTransaction: initialTransactionSchema.nullish(),
      idempotencyKey: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal('update_customer'),
      customerId: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      dateOfBirth: z.string().optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal('delete_customer'),
      customerId: z.string().optional(),
      authCode: z.string().optional(),
      verificationCode: z.string().optional(),
      verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
    })
    .passthrough(),
])

function lmsRpcErrorStatus(error) {
  if (error?.code === 'P0002') return 404
  if (error?.code === '22023' || error?.code === '23503') return 400
  if (error?.code === '42501') return 403
  return 500
}

async function lmsFailureResponse(request, operation, error, fallbackMessage) {
  const requestId = await reportOperationalError({
    event: 'lms.rpc_failed',
    request,
    error,
    alert: true,
    context: { operation, databaseCode: error?.code },
  })
  return responseWithRequestId(
    apiError(error?.message || fallbackMessage, lmsRpcErrorStatus(error)),
    requestId,
  )
}

function parseOptionalTimestamp(value) {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function isOptionalIsoDate(value) {
  if (!value) return true
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
}

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const access = await requireLmsStaff()
    if (!access.authorized) return access.response

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return apiError(
        'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        500,
      )
    }
    const supabase = createClient(url, key)

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'active' // active, overdue, all, settled
    const accountId = searchParams.get('accountId') // If provided, return this account regardless of filter
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
    const offset = (page - 1) * limit

    const { data: accountPage, error: accountPageError } = await supabase.rpc('lms_list_accounts', {
      p_filter: filter,
      p_account_id: accountId,
      p_page: page,
      p_limit: limit,
    })

    if (accountPageError) throw accountPageError
    if (accountPage) return apiOk(accountPage)

    // Defensive fallback for a null RPC result: still calculate all metrics
    // globally before filtering and pagination.
    // Fetch all customers so filters, stats, and accountId work globally.
    const { data: customers, error: custError } = await supabase
      .from('loan_customers')
      .select(
        `
        id,
        first_name,
        last_name,
        phone_number,
        email,
        address,
        created_at
      `,
      )
      .order('created_at', { ascending: false })

    if (custError) throw custError

    const customerIds = customers.map((c) => c.id)

    // Fetch loans/transactions/installments for all customers before filtering.
    const { data: allLoans, error: loansError } = await supabase
      .from('loans')
      .select('*')
      .in('loan_customer_id', customerIds)

    if (loansError) throw loansError

    const loanIds = allLoans.map((l) => l.id)

    // Fetch transactions for all matching loans.
    const { data: allTransactions, error: txError } = await supabase
      .from('loan_transactions')
      .select(
        `
        *,
        loan_payment_methods (name)
      `,
      )
      .in('loan_id', loanIds.length > 0 ? loanIds : ['00000000-0000-0000-0000-000000000000'])

    if (txError) throw txError

    // Fetch installments for all matching transactions.
    const transactionIds = allTransactions.map((t) => t.id)
    const { data: allInstallments, error: installmentsError } = await supabase
      .from('loan_installments')
      .select('*')
      .in(
        'loan_transaction_id',
        transactionIds.length > 0 ? transactionIds : ['00000000-0000-0000-0000-000000000000'],
      )

    if (installmentsError) throw installmentsError

    // Build lookup maps for O(1) access
    const loansMap = new Map()
    const transactionsMap = new Map()
    const installmentsMap = new Map()

    // Map loans by customer ID for fast lookup
    allLoans.forEach((loan) => {
      if (!loansMap.has(loan.loan_customer_id)) {
        loansMap.set(loan.loan_customer_id, [])
      }
      loansMap.get(loan.loan_customer_id).push(loan)
    })

    // Map transactions by loan ID for fast lookup
    allTransactions.forEach((tx) => {
      if (!transactionsMap.has(tx.loan_id)) {
        transactionsMap.set(tx.loan_id, [])
      }
      transactionsMap.get(tx.loan_id).push(tx)
    })

    // Map installments by transaction ID for fast lookup
    allInstallments.forEach((inst) => {
      if (!installmentsMap.has(inst.loan_transaction_id)) {
        installmentsMap.set(inst.loan_transaction_id, [])
      }
      installmentsMap.get(inst.loan_transaction_id).push(inst)
    })

    // Build enriched customer accounts
    const accounts = customers.map((customer) => {
      const customerLoans = loansMap.get(customer.id) || []
      const loanIds = customerLoans.map((l) => l.id)

      // Collect all transactions for this customer's loans
      const transactions = []
      loanIds.forEach((loanId) => {
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

      transactions.forEach((t) => {
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
        services.forEach((service) => {
          const serviceInstallments = installmentsMap.get(service.id) || []

          if (serviceInstallments.length > 0) {
            // Has installment plan - use installment due dates
            serviceInstallments.forEach((inst) => {
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
        fees.forEach((fee) => {
          dueDates.push(new Date(fee.transaction_timestamp))
        })

        // Get earliest date
        if (dueDates.length > 0) {
          nextDue = new Date(Math.min(...dueDates.map((d) => d.getTime())))
        }
      }

      const now = new Date()
      const isOverdue = nextDue && nextDue < now && balance > 0
      const isDueSoon =
        nextDue && !isOverdue && (nextDue - now) / (1000 * 60 * 60 * 24) <= 7 && balance > 0

      // Count active services
      let activeServicesCount = 0
      services.forEach((service) => {
        const serviceInstallments = installmentsMap.get(service.id) || []

        if (serviceInstallments.length > 0) {
          // Has installments - check if any are unpaid
          if (
            serviceInstallments.some((inst) => inst.status !== 'paid' && inst.status !== 'skipped')
          ) {
            activeServicesCount++
          }
        } else {
          // No installments - check if service amount hasn't been fully paid
          const servicePaid = payments.reduce((sum, p) => {
            // Match payments by date proximity (within 1 day of service)
            const dayDiff = Math.abs(
              (new Date(service.transaction_timestamp) - new Date(p.transaction_timestamp)) /
                (1000 * 60 * 60 * 24),
            )
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
        const timestamps = transactions.map((t) => new Date(t.transaction_timestamp).getTime())
        lastTransaction = new Date(Math.max(...timestamps))
      }

      // Sort transactions by date descending
      const sortedTransactions = transactions.sort(
        (a, b) => new Date(b.transaction_timestamp) - new Date(a.transaction_timestamp),
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
        loans: customerLoans,
      }
    })

    // Stats describe the complete account population, not just the current page.
    const stats = {
      totalOutstanding: accounts.reduce((sum, a) => sum + a.balance, 0),
      activeAccounts: accounts.filter((a) => a.balance > 0).length,
      overdueAccounts: accounts.filter((a) => a.isOverdue).length,
      dueSoonAccounts: accounts.filter((a) => a.isDueSoon).length,
      totalAccounts: accounts.filter((a) => a.totalLoans > 0).length,
    }

    // Apply filters
    let filtered = accounts

    // If accountId is provided, return that account regardless of filter status
    if (accountId) {
      filtered = accounts.filter((a) => a.id === accountId)
    } else if (filter === 'active') {
      filtered = accounts.filter((a) => a.balance > 0)
    } else if (filter === 'overdue') {
      filtered = accounts.filter((a) => a.isOverdue)
    } else if (filter === 'settled') {
      filtered = accounts.filter((a) => a.balance <= 0 && a.totalLoans > 0)
    }

    const totalCount = filtered.length
    const paginated = accountId ? filtered : filtered.slice(offset, offset + limit)

    return apiOk({
      accounts: paginated,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        pages: Math.ceil((totalCount || 0) / limit),
      },
    })
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'lms.account_list_failed',
      request,
      error,
      alert: true,
    })
    return responseWithRequestId(apiError(toErrorMessage(error, 'LMS API failed'), 500), requestId)
  }
}

// POST - Quick Actions
export async function POST(request) {
  try {
    const access = await requireLmsStaff()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'lms.account-action',
      limit: 120,
      windowSeconds: 15 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return apiError(
        'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        500,
      )
    }
    const supabase = createClient(url, key)

    const {
      data: body,
      error: bodyError,
      issues,
    } = await parseBodyWithSchema(request, lmsActionSchema, { maxBytes: 256 * 1024 })
    if (bodyError || !body) {
      const invalidAction = issues?.some((issue) => issue.path[0] === 'action')
      return apiError(
        invalidAction ? 'Invalid action' : bodyError || 'Invalid request payload',
        400,
      )
    }
    const idempotencyKey = getLmsIdempotencyKey(request, body)
    const { action, customerId, loanId, amount, paymentMethodId, notes, transactionDate } = body

    if (action === 'record_payment') {
      const paymentAmount = Number(amount)
      if (!loanId || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return apiError('Valid loan and payment amount required', 400)
      }

      // Use provided transaction date or default to now
      const txTimestamp = parseOptionalTimestamp(transactionDate)
      if (!txTimestamp) return apiError('Invalid transaction date', 400)

      const { data, error } = await supabase.rpc('lms_record_payment', {
        p_loan_id: loanId,
        p_employee_id: access.employee.id,
        p_amount: paymentAmount,
        p_payment_method_id: paymentMethodId || null,
        p_remark: notes || null,
        p_transaction_timestamp: txTimestamp,
        p_idempotency_key: idempotencyKey,
      })

      if (error) return lmsFailureResponse(request, action, error, 'Failed to record payment')
      return apiOk({ recordedPaymentLoanId: data?.recordedPaymentLoanId || loanId })
    } else if (action === 'add_service') {
      const { serviceAmount, initialDeposit, installmentTerms, installmentPlan, transactionDate } =
        body

      const totalAmount = parseFloat(serviceAmount)
      const deposit = parseFloat(initialDeposit) || 0
      if (!customerId || !Number.isFinite(totalAmount) || totalAmount <= 0) {
        return apiError('Valid customer and service amount required', 400)
      }
      if (!Number.isFinite(deposit) || deposit < 0 || deposit > totalAmount) {
        return apiError('Initial deposit must be between zero and the service amount', 400)
      }

      // Use provided transaction date or default to now
      const txTimestamp = parseOptionalTimestamp(transactionDate)
      if (!txTimestamp) return apiError('Invalid transaction date', 400)

      const planSummary =
        notes ||
        (installmentPlan && installmentPlan.length > 0
          ? `${installmentPlan.length} installments - ${body.paymentFrequency || 'monthly'}`
          : `${installmentTerms} installments`)
      const normalizedPlan = (installmentPlan || []).map((installment) => ({
        dueDate: installment.dueDate,
        amount: Number(installment.amount),
      }))
      if (normalizedPlan.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
        return apiError('Installment dates and amounts must be valid', 400)
      }

      const { data, error } = await supabase.rpc('lms_add_service', {
        p_customer_id: customerId,
        p_actor_id: access.employee.id,
        p_service_amount: totalAmount,
        p_initial_deposit: deposit,
        p_term_months: Number.parseInt(String(installmentTerms || '3'), 10) || 3,
        p_next_due_date: installmentPlan?.[0]?.dueDate || new Date().toISOString().split('T')[0],
        p_remark: planSummary,
        p_transaction_timestamp: txTimestamp,
        p_installment_plan: normalizedPlan,
        p_idempotency_key: idempotencyKey,
      })
      if (error) return lmsFailureResponse(request, action, error, 'Failed to add service')
      return apiOk({ createdLoanId: data?.createdLoanId })
    } else if (action === 'add_fee') {
      const { loanId, amount, notes, customerId, transactionDate } = body

      // Use provided transaction date or default to now
      const txTimestamp = parseOptionalTimestamp(transactionDate)
      if (!txTimestamp) return apiError('Invalid transaction date', 400)

      const feeAmount = parseFloat(amount)
      if (Number.isNaN(feeAmount) || feeAmount <= 0) {
        return apiError('Valid fee amount required', 400)
      }
      if (!loanId && !customerId) {
        return apiError('No loan found or created for fee', 400)
      }

      const { data, error } = await supabase.rpc('lms_add_fee', {
        p_customer_id: customerId || null,
        p_loan_id: loanId || null,
        p_actor_id: access.employee.id,
        p_amount: feeAmount,
        p_remark: notes || 'Additional fee',
        p_transaction_timestamp: txTimestamp,
        p_idempotency_key: idempotencyKey,
      })
      if (error) return lmsFailureResponse(request, action, error, 'Failed to add fee')
      return apiOk({ loanId: data?.loanId, feeAdded: Number(data?.feeAdded ?? feeAmount) })
    } else if (action === 'create_customer') {
      const { firstName, lastName, phone, email, address, initialTransaction } = body
      if (!String(firstName || '').trim() || !String(lastName || '').trim()) {
        return apiError('First and last name are required', 400)
      }
      if (initialTransaction?.type === 'payment') {
        return apiError('Initial transaction must be a service or fee', 400)
      }

      const normalizedInitialTransaction = initialTransaction
        ? { ...initialTransaction, amount: Number(initialTransaction.amount) }
        : null
      if (
        normalizedInitialTransaction &&
        (!Number.isFinite(normalizedInitialTransaction.amount) ||
          normalizedInitialTransaction.amount <= 0)
      ) {
        return apiError('Initial transaction amount must be greater than zero', 400)
      }

      const { data, error } = await supabase.rpc('lms_create_customer', {
        p_actor_id: access.employee.id,
        p_first_name: String(firstName).trim(),
        p_last_name: String(lastName).trim(),
        p_phone: phone || null,
        p_email: email || null,
        p_address: address || null,
        p_initial_transaction: normalizedInitialTransaction,
        p_idempotency_key: idempotencyKey,
      })
      if (error) {
        return lmsFailureResponse(request, action, error, 'Failed to create customer')
      }
      return apiOk({ customerId: data?.customerId })
    } else if (action === 'update_customer') {
      const { customerId, phone, email, address, dateOfBirth, notes } = body
      if (!customerId) return apiError('Customer ID required', 400)
      if (!isOptionalIsoDate(dateOfBirth)) return apiError('Invalid date of birth', 400)

      const { data, error } = await supabase.rpc('lms_update_customer', {
        p_customer_id: customerId,
        p_actor_id: access.employee.id,
        p_updates: Object.fromEntries(
          Object.entries({ phone, email, address, dateOfBirth }).filter(
            ([, value]) => value !== undefined,
          ),
        ),
        p_note: notes || null,
      })
      if (error) {
        return lmsFailureResponse(request, action, error, 'Failed to update customer')
      }
      return apiOk({ updatedCustomerId: data?.updatedCustomerId || customerId })
    } else if (action === 'delete_customer') {
      const { customerId } = body
      if (!customerId) return apiError('Customer ID required', 400)

      const verificationResponse = await verifyLmsDestructiveAction(access, {
        verificationCode: body.verificationCode ?? body.authCode,
        verificationMethod: body.verificationMethod,
      })
      if (verificationResponse) return verificationResponse

      const { data, error } = await supabase.rpc('lms_delete_customer', {
        p_customer_id: customerId,
        p_actor_id: access.employee.id,
      })
      if (error) {
        return lmsFailureResponse(request, action, error, 'Failed to delete customer')
      }

      return apiOk({ deletedCustomerId: data?.deletedCustomerId || customerId })
    }

    return apiError('Invalid action', 400)
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'lms.action_failed',
      request,
      error,
      alert: true,
    })
    return responseWithRequestId(
      apiError(toErrorMessage(error, 'LMS action failed'), 500),
      requestId,
    )
  }
}
