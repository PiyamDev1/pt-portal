import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { syncPackagePaymentFinancials } from '@/lib/packagePaymentsServer'
import type {
  TravelPackagePayment,
  TravelPackagePaymentMethod,
  TravelPackagePaymentStatus,
  TravelPackagePaymentType,
} from '@/app/types/packages'
import { selectTravelPackagePaymentColumns } from './columns'

const SCHEMA_HINT =
  'Package payment tracking is incomplete. Run the package workflow migrations, including scripts/migrations/20260827_create_group_customer_files.sql.'
const TYPES = new Set<TravelPackagePaymentType>([
  'deposit',
  'payment',
  'account_credit',
  'refund',
  'chargeback',
  'commission',
])
const METHODS = new Set<TravelPackagePaymentMethod>(['cash', 'bank_transfer', 'card', 'other'])
const STATUSES = new Set<TravelPackagePaymentStatus>([
  'pending',
  'completed',
  'failed',
  'cancelled',
  'refunded',
])

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703'
}

function isMissingAccountCreditConstraint(error: unknown, paymentType: TravelPackagePaymentType) {
  return paymentType === 'account_credit' && (error as { code?: string } | null)?.code === '23514'
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseMoney(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_payments')
    .select(selectTravelPackagePaymentColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: false })
  if (error) {
    if (isSchemaError(error))
      return apiOk({ payments: [], setupRequired: true, message: SCHEMA_HINT })
    return apiError(error.message || 'Failed to load payments', 500)
  }
  return apiOk({ payments: (data || []) as unknown as TravelPackagePayment[] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const amount = parseMoney(body.amount)
  if (amount <= 0) return apiError('Payment amount must be greater than zero', 400)
  const paymentType = cleanText(body.paymentType || body.payment_type) as TravelPackagePaymentType
  const paymentMethod = cleanText(
    body.paymentMethod || body.payment_method,
  ) as TravelPackagePaymentMethod
  const paymentStatus = cleanText(
    body.paymentStatus || body.payment_status,
  ) as TravelPackagePaymentStatus
  if (!TYPES.has(paymentType)) return apiError('Invalid payment type', 400)
  if (!METHODS.has(paymentMethod)) return apiError('Invalid payment method', 400)
  if (!STATUSES.has(paymentStatus)) return apiError('Invalid payment status', 400)

  const now = new Date().toISOString()
  const invoiceId = cleanText(body.invoiceId || body.invoice_id) || null
  const reservationId = cleanText(body.reservationId || body.reservation_id) || null
  const quoteId = cleanText(body.quoteId || body.quote_id) || null
  const groupMemberId = cleanText(body.groupMemberId || body.group_member_id) || null
  if (Boolean(quoteId) !== Boolean(groupMemberId)) {
    return apiError('Choose both a family quotation and its group member', 400)
  }
  if (quoteId && groupMemberId) {
    const { data: packageRow, error: packageError } = await supabase
      .from('travel_packages')
      .select('group_id, customer_file_mode')
      .eq('id', id)
      .single()
    if (packageError || !packageRow || packageRow.customer_file_mode !== 'group') {
      return apiError('Family payments can only be assigned inside a group customer file', 400)
    }
    const { data: familyMember, error: familyError } = await supabase
      .from('travel_package_group_members')
      .select('id')
      .eq('id', groupMemberId)
      .eq('group_id', packageRow.group_id)
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (familyError || !familyMember) {
      return apiError('The selected family does not belong to this group customer file', 400)
    }
  }
  const receiptReference = cleanText(body.receiptReference || body.receipt_reference)
  if (paymentType === 'account_credit' && !receiptReference) {
    return apiError('Enter the previous package or refund reference for this account credit', 400)
  }
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {}
  const { data, error } = await supabase
    .from('travel_package_payments')
    .insert({
      package_id: id,
      quote_id: quoteId,
      group_member_id: groupMemberId,
      invoice_id: invoiceId,
      reservation_id: reservationId,
      amount,
      currency: cleanText(body.currency).toUpperCase() || 'GBP',
      payment_type: paymentType,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      requested_at:
        cleanText(body.requestedAt || body.requested_at) ||
        (paymentStatus === 'pending' ? now : null),
      due_at: cleanText(body.dueAt || body.due_at) || null,
      received_at:
        cleanText(body.receivedAt || body.received_at) ||
        (paymentStatus === 'completed' ? now : null),
      received_by: paymentStatus === 'completed' ? user.id : null,
      receipt_reference: receiptReference || null,
      notes: cleanText(body.notes) || null,
      metadata: {
        ...metadata,
        ...(paymentType === 'account_credit' ? { source: 'previous_refund_reimbursement' } : {}),
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select(selectTravelPackagePaymentColumns())
    .single()
  if (error || !data) {
    if (isMissingAccountCreditConstraint(error, paymentType)) {
      return apiError(
        'Previous-refund credit is not enabled in Supabase yet. Run scripts/migrations/2026082801_repair_travel_package_account_credit.sql.',
        503,
      )
    }
    if (isSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to record payment', 500)
  }

  const installmentId = cleanText(body.installmentId || body.installment_id)
  if (installmentId) {
    await supabase
      .from('travel_package_installments')
      .update({
        payment_id: (data as unknown as { id: string }).id,
        status: paymentStatus === 'completed' ? 'paid' : 'due',
        paid_at: paymentStatus === 'completed' ? now : null,
      })
      .eq('id', installmentId)
      .eq('package_id', id)
  }

  const sync = await syncPackagePaymentFinancials(supabase, id, invoiceId)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId,
      actorId: user.id,
      eventType: 'payment_recorded',
      eventSummary: `${paymentType} of ${cleanText(body.currency).toUpperCase() || 'GBP'} ${amount.toFixed(2)} recorded.`,
      afterData: data,
    },
  )
  return apiOk(
    { payment: data as unknown as TravelPackagePayment, summary: sync.paymentSummary },
    { status: 201 },
  )
}
