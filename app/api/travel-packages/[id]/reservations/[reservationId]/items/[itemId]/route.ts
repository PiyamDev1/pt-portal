import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
} from '@/app/types/packages'
import { selectTravelPackageReservationColumns } from '../../../route'
import { selectTravelPackageReservationItemColumns } from '../route'

const SCHEMA_HINT =
  'Travel package reservation item schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_reservations.sql in Supabase SQL editor.'

const ITEM_TYPES = new Set<TravelPackageReservationItemType>([
  'flight',
  'hotel',
  'visa',
  'transport',
  'commission',
  'discount',
  'other',
])

const ITEM_STATUSES = new Set<TravelPackageReservationItemStatus>([
  'draft',
  'reserved',
  'confirmed',
  'changed',
  'cancelled',
])

function isReservationItemSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10' || code === '23503'
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getBodyValue(body: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return body[camelKey] ?? body[snakeKey]
}

function hasBodyKey(body: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return Object.prototype.hasOwnProperty.call(body, camelKey)
    || Object.prototype.hasOwnProperty.call(body, snakeKey)
}

function parseMoney(value: unknown) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 0
  return Math.round(Math.max(0, number) * 100) / 100
}

function parseQuantity(value: unknown) {
  const number = Number(value ?? 1)
  if (!Number.isFinite(number) || number <= 0) return 1
  return Math.round(number * 100) / 100
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

async function loadParentReservation(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
  reservationId: string,
) {
  return supabase
    .from('travel_package_reservations')
    .select(selectTravelPackageReservationColumns())
    .eq('id', reservationId)
    .eq('package_id', packageId)
    .single()
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string; itemId: string }> },
) {
  const { id, reservationId, itemId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await parseBody(request)
  if (!body) return apiError('Invalid JSON body', 400)

  const updatePayload: Record<string, unknown> = {}

  if (hasBodyKey(body, 'itemType', 'item_type')) {
    const requestedType = cleanText(getBodyValue(body, 'itemType', 'item_type'))
    if (!ITEM_TYPES.has(requestedType as TravelPackageReservationItemType)) {
      return apiError('Invalid reservation item type', 400)
    }
    updatePayload.item_type = requestedType
  }

  if (hasBodyKey(body, 'title', 'title')) {
    const title = cleanText(body.title)
    if (!title) return apiError('Reservation item title is required', 400)
    updatePayload.title = title
  }

  if (hasBodyKey(body, 'status', 'status')) {
    const requestedStatus = cleanText(body.status)
    if (!ITEM_STATUSES.has(requestedStatus as TravelPackageReservationItemStatus)) {
      return apiError('Invalid reservation item status', 400)
    }
    updatePayload.status = requestedStatus
  }

  const textFields = [
    ['description', 'description', 'description'],
    ['currency', 'currency', 'currency'],
    ['supplierReference', 'supplier_reference', 'supplier_reference'],
  ] as const

  textFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = cleanText(getBodyValue(body, camelKey, snakeKey)) || null
    }
  })

  if (hasBodyKey(body, 'quantity', 'quantity')) {
    updatePayload.quantity = parseQuantity(body.quantity)
  }

  const moneyFields = [
    ['unitBookedCost', 'unit_booked_cost', 'unit_booked_cost'],
    ['unitSoldPrice', 'unit_sold_price', 'unit_sold_price'],
    ['discountAmount', 'discount_amount', 'discount_amount'],
    ['commissionExpectedAmount', 'commission_expected_amount', 'commission_expected_amount'],
    ['commissionReceivedAmount', 'commission_received_amount', 'commission_received_amount'],
  ] as const

  moneyFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = parseMoney(getBodyValue(body, camelKey, snakeKey))
    }
  })

  const dateFields = [
    ['startsAt', 'starts_at', 'starts_at'],
    ['endsAt', 'ends_at', 'ends_at'],
  ] as const

  dateFields.forEach(([camelKey, snakeKey, column]) => {
    if (hasBodyKey(body, camelKey, snakeKey)) {
      updatePayload[column] = parseOptionalDate(getBodyValue(body, camelKey, snakeKey))
    }
  })

  if (hasBodyKey(body, 'metadata', 'metadata')) {
    updatePayload.metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {}
  }

  if (Object.keys(updatePayload).length === 0) {
    return apiError('No reservation item updates supplied', 400)
  }

  const { data: itemData, error: updateError } = await supabase
    .from('travel_package_reservation_items')
    .update(updatePayload)
    .eq('id', itemId)
    .eq('reservation_id', reservationId)
    .eq('package_id', id)
    .select(selectTravelPackageReservationItemColumns())
    .single()

  if (updateError || !itemData) {
    if (isReservationItemSchemaError(updateError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError(updateError?.message || 'Failed to update reservation item', 500)
  }

  const { data: reservationData, error: reservationError } = await loadParentReservation(
    supabase,
    id,
    reservationId,
  )

  if (reservationError || !reservationData) {
    return apiOk({
      item: itemData as unknown as TravelPackageReservationItem,
      reservation: null,
      setupRequired: false,
    })
  }

  return apiOk({
    item: itemData as unknown as TravelPackageReservationItem,
    reservation: reservationData as unknown as TravelPackageReservation,
    setupRequired: false,
  })
}
