/**
 * Authenticated, atomic installment-payment operations.
 */
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { getSearchParam, parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  getLmsIdempotencyKey,
  requireLmsStaff,
  verifyLmsDestructiveAction,
} from '@/lib/lms/apiAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const paymentAmountSchema = z.union([z.string().trim().min(1).max(100), z.number().finite()])
const postBodySchema = z
  .object({
    installmentId: z.string().trim().min(1).max(200).optional(),
    employeeId: z.string().trim().max(200).optional(),
    paymentAmount: paymentAmountSchema.optional(),
    paymentMethod: z.string().trim().max(200).optional().nullable(),
    paymentDate: z.string().trim().max(50).optional().nullable(),
    loanId: z.string().trim().max(200).optional(),
    serviceTransactionId: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().trim().max(200).optional(),
    idempotency_key: z.string().trim().max(200).optional(),
  })
  .strict()

const patchBodySchema = z
  .object({
    transactionId: z.string().trim().min(1).max(200).optional(),
    paymentAmount: paymentAmountSchema.optional(),
    paymentDate: z.string().trim().max(50).optional(),
    paymentMethod: z.string().trim().max(200).optional().nullable(),
  })
  .strict()

function paymentTimestamp(value?: string | null) {
  if (!value) return new Date().toISOString()
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function rpcErrorStatus(error: { code?: string } | null) {
  if (error?.code === 'P0002') return 404
  if (error?.code === '22023') return 400
  return 500
}

async function enforcePaymentMutationLimit(request: Request, userId: string) {
  return enforceRateLimit(request, {
    scope: 'lms.installment-payment-mutate',
    limit: 120,
    windowSeconds: 15 * 60,
    identities: [`user:${userId}`, `ip:${getClientIp(request)}`],
  })
}

export async function POST(request: Request) {
  const access = await requireLmsStaff()
  if (!access.authorized) return access.response

  try {
    const limit = await enforcePaymentMutationLimit(request, access.user.id)
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, postBodySchema, {
      maxBytes: 16 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const { installmentId, paymentAmount, paymentMethod, paymentDate } = body
    if (!installmentId) return apiError('installmentId is required', 400)

    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiError('paymentAmount must be greater than zero', 400)
    }

    const timestamp = paymentTimestamp(paymentDate)
    if (!timestamp) return apiError('paymentDate must be a valid date', 400)

    const supabase = getServiceSupabaseClient()
    const isTempId = installmentId.startsWith('temp__')
    const tempInstallmentNumber = isTempId ? Number(installmentId.split('__')[2]) : null
    if (
      isTempId &&
      (tempInstallmentNumber === null ||
        !Number.isInteger(tempInstallmentNumber) ||
        tempInstallmentNumber < 1)
    ) {
      return apiError('Temporary installment ID is invalid', 400)
    }
    let loanId = body.loanId
    let serviceTransactionId = body.serviceTransactionId

    if (!isTempId) {
      const { data, error } = await supabase
        .from('loan_installments')
        .select('loan_transaction_id, loan_transactions!inner(loan_id, id)')
        .eq('id', installmentId)
        .single()

      if (error || !data) return apiError('Installment not found', 404)
      const transaction = Array.isArray(data.loan_transactions)
        ? data.loan_transactions[0]
        : data.loan_transactions
      loanId = transaction?.loan_id
      serviceTransactionId = transaction?.id
    }

    if (!loanId || !serviceTransactionId) {
      return apiError(
        isTempId
          ? 'loanId and serviceTransactionId required for temporary installments'
          : 'Installment transaction data is incomplete',
        400,
      )
    }

    const { data, error } = await supabase.rpc('lms_record_installment_payment', {
      p_installment_id: isTempId ? null : installmentId,
      p_loan_id: loanId,
      p_service_transaction_id: serviceTransactionId,
      p_employee_id: access.employee.id,
      p_amount: amount,
      p_payment_method_id: paymentMethod || null,
      p_transaction_timestamp: timestamp,
      p_idempotency_key: getLmsIdempotencyKey(request, body),
      p_expected_installment_number: tempInstallmentNumber,
    })

    if (error) return apiError(error.message || 'Failed to record payment', rpcErrorStatus(error))
    return apiOk({
      recordedPaymentAmount: paymentAmount,
      loanId,
      newBalance: Number(data?.newBalance ?? 0),
    })
  } catch (error) {
    console.error('[Installment Payment]', error)
    return apiError(error instanceof Error ? error.message : 'Failed to record payment', 500)
  }
}

export async function DELETE(request: Request) {
  const access = await requireLmsStaff()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'lms.delete-installment-payment',
    limit: 20,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const transactionId = getSearchParam(request.url, 'transactionId')
  const accountId = getSearchParam(request.url, 'accountId')
  if (!transactionId || !accountId) {
    return apiError('transactionId and accountId are required', 400)
  }

  const verificationResponse = await verifyLmsDestructiveAction(access, {
    verificationCode:
      request.headers.get('x-verification-code') || getSearchParam(request.url, 'verificationCode'),
    verificationMethod:
      request.headers.get('x-verification-method') ||
      getSearchParam(request.url, 'verificationMethod') ||
      undefined,
  })
  if (verificationResponse) return verificationResponse

  try {
    const supabase = getServiceSupabaseClient()
    const { data, error } = await supabase.rpc('lms_delete_payment', {
      p_transaction_id: transactionId,
    })
    if (error) return apiError(error.message || 'Failed to delete payment', rpcErrorStatus(error))
    return apiOk({ deletedTransactionId: data?.deletedTransactionId || transactionId })
  } catch (error) {
    console.error('[Installment Payment Delete]', error)
    return apiError(error instanceof Error ? error.message : 'Failed to delete payment', 500)
  }
}

export async function PATCH(request: Request) {
  const access = await requireLmsStaff()
  if (!access.authorized) return access.response

  try {
    const limit = await enforcePaymentMutationLimit(request, access.user.id)
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, patchBodySchema, {
      maxBytes: 16 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const { transactionId, paymentAmount, paymentDate, paymentMethod } = body
    if (!transactionId) return apiError('transactionId is required', 400)

    const amount = paymentAmount === undefined ? null : Number(paymentAmount)
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      return apiError('paymentAmount must be greater than zero', 400)
    }

    const timestamp = paymentDate ? paymentTimestamp(paymentDate) : null
    if (paymentDate && !timestamp) return apiError('paymentDate must be a valid date', 400)
    if (amount === null && !timestamp && paymentMethod === undefined) {
      return apiError('At least one payment field is required', 400)
    }

    const supabase = getServiceSupabaseClient()
    const { data, error } = await supabase.rpc('lms_update_payment', {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_payment_method_id: paymentMethod ?? null,
      p_set_payment_method: paymentMethod !== undefined,
      p_transaction_timestamp: timestamp,
    })
    if (error) return apiError(error.message || 'Failed to update payment', rpcErrorStatus(error))
    return apiOk({ updatedTransactionId: data?.updatedTransactionId || transactionId })
  } catch (error) {
    console.error('[Installment Payment Update]', error)
    return apiError(error instanceof Error ? error.message : 'Failed to update payment', 500)
  }
}
