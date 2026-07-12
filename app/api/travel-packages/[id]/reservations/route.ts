import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageReservation,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
} from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Travel package reservation schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_reservations.sql in Supabase SQL editor.'

const RESERVATION_TYPES = new Set<TravelPackageReservationType>([
  'flight',
  'hotel',
  'visa',
  'transport',
  'other',
])

const RESERVATION_STATUSES = new Set<TravelPackageReservationStatus>([
  'not_started',
  'quote_requested',
  'availability_checked',
  'reservation_pending',
  'reserved',
  'deposit_required',
  'paid',
  'confirmed',
  'changed',
  'cancelled',
  'failed',
])

function isReservationSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export function selectTravelPackageReservationColumns() {
  return `
    id,
    package_id,
    quote_id,
    created_by,
    updated_by,
    reservation_type,
    title,
    status,
    supplier_name,
    supplier_reference,
    booking_reference,
    currency,
    booked_cost_total,
    sold_price_total,
    discount_total,
    commission_expected_total,
    commission_received_total,
    deposit_required,
    deposit_amount,
    deposit_due_at,
    payment_due_at,
    reserved_at,
    confirmed_at,
    cancelled_at,
    customer_visible,
    public_notes,
    internal_notes,
    metadata,
    created_at,
    updated_at
  `
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getBodyValue(body: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return body[camelKey] ?? body[snakeKey]
}

function parseMoney(value: unknown) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 0
  return Math.round(Math.max(0, number) * 100) / 100
}

function parseOptionalDate(value: unknown) {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : text
}

async function parseBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_reservations')
    .select(selectTravelPackageReservationColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    if (isReservationSchemaError(error)) {
      return apiOk({ reservations: [], setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load package reservations', 500)
  }

  return apiOk({
    reservations: (data || []) as unknown as TravelPackageReservation[],
    setupRequired: false,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await parseBody(request)
  if (!body) return apiError('Invalid JSON body', 400)

  const title = cleanText(body.title)
  if (!title) return apiError('Reservation title is required', 400)

  const requestedType = cleanText(getBodyValue(body, 'reservationType', 'reservation_type'))
  const requestedStatus = cleanText(body.status)
  const reservationType = RESERVATION_TYPES.has(requestedType as TravelPackageReservationType)
    ? (requestedType as TravelPackageReservationType)
    : 'other'
  const status = RESERVATION_STATUSES.has(requestedStatus as TravelPackageReservationStatus)
    ? (requestedStatus as TravelPackageReservationStatus)
    : 'not_started'

  const insertPayload = {
    package_id: id,
    quote_id: cleanText(getBodyValue(body, 'quoteId', 'quote_id')) || null,
    created_by: user.id,
    updated_by: user.id,
    reservation_type: reservationType,
    title,
    status,
    supplier_name: cleanText(getBodyValue(body, 'supplierName', 'supplier_name')) || null,
    supplier_reference: cleanText(getBodyValue(body, 'supplierReference', 'supplier_reference')) || null,
    booking_reference: cleanText(getBodyValue(body, 'bookingReference', 'booking_reference')) || null,
    currency: cleanText(body.currency) || 'GBP',
    booked_cost_total: parseMoney(getBodyValue(body, 'bookedCostTotal', 'booked_cost_total')),
    sold_price_total: parseMoney(getBodyValue(body, 'soldPriceTotal', 'sold_price_total')),
    discount_total: parseMoney(getBodyValue(body, 'discountTotal', 'discount_total')),
    commission_expected_total: parseMoney(
      getBodyValue(body, 'commissionExpectedTotal', 'commission_expected_total'),
    ),
    commission_received_total: parseMoney(
      getBodyValue(body, 'commissionReceivedTotal', 'commission_received_total'),
    ),
    deposit_required: Boolean(getBodyValue(body, 'depositRequired', 'deposit_required')),
    deposit_amount: parseMoney(getBodyValue(body, 'depositAmount', 'deposit_amount')),
    deposit_due_at: parseOptionalDate(getBodyValue(body, 'depositDueAt', 'deposit_due_at')),
    payment_due_at: parseOptionalDate(getBodyValue(body, 'paymentDueAt', 'payment_due_at')),
    reserved_at: parseOptionalDate(getBodyValue(body, 'reservedAt', 'reserved_at')),
    confirmed_at: parseOptionalDate(getBodyValue(body, 'confirmedAt', 'confirmed_at')),
    customer_visible: Boolean(getBodyValue(body, 'customerVisible', 'customer_visible')),
    public_notes: cleanText(getBodyValue(body, 'publicNotes', 'public_notes')) || null,
    internal_notes: cleanText(getBodyValue(body, 'internalNotes', 'internal_notes')) || null,
    metadata:
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {},
  }

  const { data, error } = await supabase
    .from('travel_package_reservations')
    .insert(insertPayload)
    .select(selectTravelPackageReservationColumns())
    .single()

  if (error) {
    if (isReservationSchemaError(error)) {
      return apiOk({ reservation: null, setupRequired: true, message: SCHEMA_HINT }, { status: 503 })
    }
    return apiError(error.message || 'Failed to create package reservation', 500)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: insertPayload.quote_id,
      actorId: user.id,
      eventType: 'reservation_created',
      eventSummary: `${reservationType} reservation "${title}" created.`,
      afterData: data,
    },
  )

  return apiOk(
    { reservation: data as unknown as TravelPackageReservation, setupRequired: false },
    { status: 201 },
  )
}
