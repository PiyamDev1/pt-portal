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

const SCHEMA_HINT =
  'Package payment tracking is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql, scripts/migrations/20260712_create_travel_package_invoices.sql, then scripts/migrations/20260712_finalize_travel_package_workflow.sql.'
const TYPES = new Set<TravelPackagePaymentType>([
  'deposit',
  'payment',
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

export function selectTravelPackagePaymentColumns() {
  return `
    id, package_id, invoice_id, amount, currency, payment_type, payment_method,
    payment_status, requested_at, due_at, received_at, received_by,
    receipt_reference, receipt_document_id, notes, metadata, created_by,
    updated_by, created_at, updated_at
  `
}

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703'
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
  const { data, error } = await supabase
    .from('travel_package_payments')
    .insert({
      package_id: id,
      invoice_id: invoiceId,
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
      receipt_reference: cleanText(body.receiptReference || body.receipt_reference) || null,
      notes: cleanText(body.notes) || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(selectTravelPackagePaymentColumns())
    .single()
  if (error || !data) {
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
