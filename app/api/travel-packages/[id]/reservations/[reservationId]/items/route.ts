import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
} from '@/app/types/packages'
import { selectTravelPackageReservationColumns } from '../../route'

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

export function selectTravelPackageReservationItemColumns() {
  return `
    id,
    reservation_id,
    package_id,
    item_type,
    title,
    description,
    quantity,
    unit_booked_cost,
    unit_sold_price,
    discount_amount,
    commission_expected_amount,
    commission_received_amount,
    total_booked_cost,
    total_sold_price,
    currency,
    supplier_reference,
    status,
    starts_at,
    ends_at,
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string }> },
) {
  const { id, reservationId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_reservation_items')
    .select(selectTravelPackageReservationItemColumns())
    .eq('reservation_id', reservationId)
    .eq('package_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    if (isReservationItemSchemaError(error)) {
      return apiOk({ items: [], setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load reservation items', 500)
  }

  return apiOk({
    items: (data || []) as unknown as TravelPackageReservationItem[],
    setupRequired: false,
  })
}

export async function POST(
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

  const title = cleanText(body.title)
  if (!title) return apiError('Reservation item title is required', 400)

  const { data: parentReservation, error: parentError } = await loadParentReservation(
    supabase,
    id,
    reservationId,
  )

  if (parentError || !parentReservation) {
    if (isReservationItemSchemaError(parentError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError('Package reservation not found', 404)
  }

  const requestedType = cleanText(getBodyValue(body, 'itemType', 'item_type'))
  const requestedStatus = cleanText(body.status)
  const itemType = ITEM_TYPES.has(requestedType as TravelPackageReservationItemType)
    ? (requestedType as TravelPackageReservationItemType)
    : ((parentReservation as { reservation_type?: TravelPackageReservationItemType })
        .reservation_type || 'other')
  const status = ITEM_STATUSES.has(requestedStatus as TravelPackageReservationItemStatus)
    ? (requestedStatus as TravelPackageReservationItemStatus)
    : 'draft'
  const quantity = parseQuantity(body.quantity)
  const unitBookedCost = parseMoney(getBodyValue(body, 'unitBookedCost', 'unit_booked_cost'))
  const unitSoldPrice = parseMoney(getBodyValue(body, 'unitSoldPrice', 'unit_sold_price'))

  const { data: itemData, error: insertError } = await supabase
    .from('travel_package_reservation_items')
    .insert({
      reservation_id: reservationId,
      package_id: id,
      item_type: itemType,
      title,
      description: cleanText(body.description) || null,
      quantity,
      unit_booked_cost: unitBookedCost,
      unit_sold_price: unitSoldPrice,
      discount_amount: parseMoney(getBodyValue(body, 'discountAmount', 'discount_amount')),
      commission_expected_amount: parseMoney(
        getBodyValue(body, 'commissionExpectedAmount', 'commission_expected_amount'),
      ),
      commission_received_amount: parseMoney(
        getBodyValue(body, 'commissionReceivedAmount', 'commission_received_amount'),
      ),
      total_booked_cost: Math.round(quantity * unitBookedCost * 100) / 100,
      total_sold_price: Math.round(quantity * unitSoldPrice * 100) / 100,
      currency:
        cleanText(body.currency) || (parentReservation as { currency?: string }).currency || 'GBP',
      supplier_reference:
        cleanText(getBodyValue(body, 'supplierReference', 'supplier_reference')) || null,
      status,
      starts_at: parseOptionalDate(getBodyValue(body, 'startsAt', 'starts_at')),
      ends_at: parseOptionalDate(getBodyValue(body, 'endsAt', 'ends_at')),
      metadata:
        body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? body.metadata
          : {},
    })
    .select(selectTravelPackageReservationItemColumns())
    .single()

  if (insertError || !itemData) {
    if (isReservationItemSchemaError(insertError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError(insertError?.message || 'Failed to create reservation item', 500)
  }

  const { data: reservationData, error: reservationError } = await loadParentReservation(
    supabase,
    id,
    reservationId,
  )

  if (reservationError || !reservationData) {
    return apiOk(
      {
        item: itemData as unknown as TravelPackageReservationItem,
        reservation: parentReservation as unknown as TravelPackageReservation,
        setupRequired: false,
      },
      { status: 201 },
    )
  }

  return apiOk(
    {
      item: itemData as unknown as TravelPackageReservationItem,
      reservation: reservationData as unknown as TravelPackageReservation,
      setupRequired: false,
    },
    { status: 201 },
  )
}
