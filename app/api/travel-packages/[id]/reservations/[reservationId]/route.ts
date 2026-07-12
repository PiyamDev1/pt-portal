import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageReservation,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
} from '@/app/types/packages'
import { selectTravelPackageReservationColumns } from '../route'
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

function hasBodyKey(body: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return Object.prototype.hasOwnProperty.call(body, camelKey)
    || Object.prototype.hasOwnProperty.call(body, snakeKey)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string }> },
) {
  const { id, reservationId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await parseBody(request)
  if (!body) return apiError('Invalid JSON body', 400)

  const updatePayload: Record<string, unknown> = {
    updated_by: user.id,
  }

  if (hasBodyKey(body, 'title', 'title')) {
    const title = cleanText(body.title)
    if (!title) return apiError('Reservation title is required', 400)
    updatePayload.title = title
  }

  if (hasBodyKey(body, 'reservationType', 'reservation_type')) {
    const requestedType = cleanText(getBodyValue(body, 'reservationType', 'reservation_type'))
    if (!RESERVATION_TYPES.has(requestedType as TravelPackageReservationType)) {
      return apiError('Invalid reservation type', 400)
    }
    updatePayload.reservation_type = requestedType
  }

  if (hasBodyKey(body, 'status', 'status')) {
    const requestedStatus = cleanText(body.status)
    if (!RESERVATION_STATUSES.has(requestedStatus as TravelPackageReservationStatus)) {
      return apiError('Invalid reservation status', 400)
    }
    updatePayload.status = requestedStatus
  }

  const textFields = [
    ['supplierName', 'supplier_name', 'supplier_name'],
    ['supplierReference', 'supplier_reference', 'supplier_reference'],
    ['bookingReference', 'booking_reference', 'booking_reference'],
    ['currency', 'currency', 'currency'],
    ['publicNotes', 'public_notes', 'public_notes'],
    ['internalNotes', 'internal_notes', 'internal_notes'],
  ] as const

  textFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = cleanText(getBodyValue(body, camelKey, snakeKey)) || null
    }
  })

  const moneyFields = [
    ['bookedCostTotal', 'booked_cost_total', 'booked_cost_total'],
    ['soldPriceTotal', 'sold_price_total', 'sold_price_total'],
    ['discountTotal', 'discount_total', 'discount_total'],
    ['commissionExpectedTotal', 'commission_expected_total', 'commission_expected_total'],
    ['commissionReceivedTotal', 'commission_received_total', 'commission_received_total'],
    ['depositAmount', 'deposit_amount', 'deposit_amount'],
  ] as const

  moneyFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = parseMoney(getBodyValue(body, camelKey, snakeKey))
    }
  })

  const dateFields = [
    ['depositDueAt', 'deposit_due_at', 'deposit_due_at'],
    ['paymentDueAt', 'payment_due_at', 'payment_due_at'],
    ['reservedAt', 'reserved_at', 'reserved_at'],
    ['confirmedAt', 'confirmed_at', 'confirmed_at'],
    ['cancelledAt', 'cancelled_at', 'cancelled_at'],
  ] as const

  dateFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = parseOptionalDate(getBodyValue(body, camelKey, snakeKey))
    }
  })

  if (hasBodyKey(body, 'depositRequired', 'deposit_required')) {
    updatePayload.deposit_required = Boolean(getBodyValue(body, 'depositRequired', 'deposit_required'))
  }

  if (hasBodyKey(body, 'customerVisible', 'customer_visible')) {
    updatePayload.customer_visible = Boolean(getBodyValue(body, 'customerVisible', 'customer_visible'))
  }

  if (hasBodyKey(body, 'metadata', 'metadata')) {
    updatePayload.metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {}
  }

  if (Object.keys(updatePayload).length === 1) {
    return apiError('No reservation updates supplied', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_reservations')
    .update(updatePayload)
    .eq('id', reservationId)
    .eq('package_id', id)
    .select(selectTravelPackageReservationColumns())
    .single()

  if (error) {
    if (isReservationSchemaError(error)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError(error.message || 'Failed to update package reservation', 500)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'reservation_updated',
      eventSummary: `Reservation ${reservationId} updated.`,
      afterData: data,
      metadata: { changedFields: Object.keys(updatePayload).filter((key) => key !== 'updated_by') },
    },
  )

  return apiOk({
    reservation: data as unknown as TravelPackageReservation,
    setupRequired: false,
  })
}
