import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  calculatePackageInvoiceTotals,
  createPackageInvoiceLinesFromReservations,
  createPackageInvoiceNumber,
  roundPackageInvoiceMoney,
} from '@/lib/packageInvoices'
import type {
  TravelPackageFolder,
  TravelPackageInvoice,
  TravelPackageInvoiceLine,
  TravelPackageInvoiceStatus,
  TravelPackageReservation,
  TravelPackageReservationItem,
} from '@/app/types/packages'
import { selectTravelPackageReservationItemColumns } from '../reservations/[reservationId]/items/route'
import { selectTravelPackageReservationColumns } from '../reservations/route'

const SCHEMA_HINT =
  'Travel package invoice schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_invoices.sql in Supabase SQL editor.'

const INVOICE_STATUSES = new Set<TravelPackageInvoiceStatus>([
  'draft',
  'pending_payment',
  'part_paid',
  'paid',
  'released',
  'void',
])

function isInvoiceSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10' || code === '23503'
}

export function selectTravelPackageInvoiceColumns() {
  return `
    id,
    package_id,
    quote_id,
    created_by,
    updated_by,
    released_by,
    invoice_number,
    status,
    currency,
    subtotal_sold,
    discount_total,
    total_sold,
    total_paid,
    balance_due,
    total_booked_cost,
    projected_margin,
    expected_commission_total,
    received_commission_total,
    released_to_customer,
    released_at,
    version,
    customer_terms,
    internal_notes,
    metadata,
    created_at,
    updated_at,
    voided_at
  `
}

export function selectTravelPackageInvoiceLineColumns() {
  return `
    id,
    invoice_id,
    package_id,
    reservation_id,
    reservation_item_id,
    line_type,
    description,
    quantity,
    unit_sold_price,
    total_sold_price,
    unit_booked_cost,
    total_booked_cost,
    discount_amount,
    expected_commission,
    received_commission,
    customer_visible,
    sort_order,
    metadata,
    created_at,
    updated_at
  `
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasBodyKey(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function getBodyValue(body: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return body[camelKey] ?? body[snakeKey]
}

async function parseBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function loadInvoiceLines(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
  invoiceId: string,
) {
  return supabase
    .from('travel_package_invoice_lines')
    .select(selectTravelPackageInvoiceLineColumns())
    .eq('package_id', packageId)
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })
}

async function loadLatestInvoice(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
) {
  return supabase
    .from('travel_package_invoices')
    .select(selectTravelPackageInvoiceColumns())
    .eq('package_id', packageId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
}

async function loadPackageFolder(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
) {
  return supabase
    .from('travel_packages')
    .select('id, package_reference, source_quote_id, invoice_status')
    .eq('id', packageId)
    .single()
}

function mapInvoiceStatusToPackageStatus(
  status: TravelPackageInvoiceStatus,
  releasedToCustomer: boolean,
) {
  if (status === 'void') return 'void'
  if (releasedToCustomer || status === 'released') return 'released_to_customer'
  if (status === 'draft') return 'draft'
  return 'finalised'
}

function withLines(invoice: TravelPackageInvoice, lines: TravelPackageInvoiceLine[]) {
  return {
    ...invoice,
    lines,
  }
}

async function syncPackageInvoiceStatus(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
  status: TravelPackageInvoiceStatus,
  releasedToCustomer: boolean,
) {
  await supabase
    .from('travel_packages')
    .update({
      invoice_status: mapInvoiceStatusToPackageStatus(status, releasedToCustomer),
    })
    .eq('id', packageId)
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

  const { data, error } = await loadLatestInvoice(supabase, id)
  if (error) {
    if (isInvoiceSchemaError(error)) {
      return apiOk({ invoice: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load package invoice', 500)
  }

  const invoice = ((data || []) as unknown as TravelPackageInvoice[])[0]
  if (!invoice) {
    return apiOk({ invoice: null, setupRequired: false })
  }

  const { data: lineData, error: lineError } = await loadInvoiceLines(supabase, id, invoice.id)
  if (lineError) {
    if (isInvoiceSchemaError(lineError)) {
      return apiOk({ invoice: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(lineError.message || 'Failed to load package invoice lines', 500)
  }

  return apiOk({
    invoice: withLines(invoice, (lineData || []) as unknown as TravelPackageInvoiceLine[]),
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
  const regenerate = Boolean(body.regenerate)

  const { data: packageData, error: packageError } = await loadPackageFolder(supabase, id)
  if (packageError || !packageData) {
    if (isInvoiceSchemaError(packageError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  if (!regenerate) {
    const { data: existingData, error: existingError } = await loadLatestInvoice(supabase, id)
    if (existingError) {
      if (isInvoiceSchemaError(existingError)) return apiError(SCHEMA_HINT, 503)
      return apiError(existingError.message || 'Failed to check existing package invoice', 500)
    }
    const existingInvoice = ((existingData || []) as unknown as TravelPackageInvoice[])[0]
    if (existingInvoice) {
      const { data: existingLines } = await loadInvoiceLines(supabase, id, existingInvoice.id)
      return apiOk({
        invoice: withLines(
          existingInvoice,
          (existingLines || []) as unknown as TravelPackageInvoiceLine[],
        ),
        setupRequired: false,
      })
    }
  }

  const { data: reservationData, error: reservationError } = await supabase
    .from('travel_package_reservations')
    .select(selectTravelPackageReservationColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: true })

  if (reservationError) {
    if (isInvoiceSchemaError(reservationError)) return apiError(SCHEMA_HINT, 503)
    return apiError(reservationError.message || 'Failed to load package reservations', 500)
  }

  const reservations = (reservationData || []) as unknown as TravelPackageReservation[]
  const { data: itemData, error: itemError } = await supabase
    .from('travel_package_reservation_items')
    .select(selectTravelPackageReservationItemColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: true })

  if (itemError && !isInvoiceSchemaError(itemError)) {
    return apiError(itemError.message || 'Failed to load reservation line items', 500)
  }

  const items = (itemData || []) as unknown as TravelPackageReservationItem[]
  const itemsByReservation = new Map<string, TravelPackageReservationItem[]>()
  items.forEach((item) => {
    const next = itemsByReservation.get(item.reservation_id) || []
    next.push(item)
    itemsByReservation.set(item.reservation_id, next)
  })

  const reservationsWithItems = reservations.map((reservation) => ({
    ...reservation,
    items: itemsByReservation.get(reservation.id) || [],
  }))
  const invoiceLines = createPackageInvoiceLinesFromReservations(reservationsWithItems)
  const totals = calculatePackageInvoiceTotals(invoiceLines)
  const packageFolder = packageData as Pick<
    TravelPackageFolder,
    'package_reference' | 'source_quote_id'
  >
  const invoiceNumber = createPackageInvoiceNumber(packageFolder.package_reference)

  const { data: invoiceData, error: invoiceError } = await supabase
    .from('travel_package_invoices')
    .insert({
      package_id: id,
      quote_id: packageFolder.source_quote_id,
      created_by: user.id,
      updated_by: user.id,
      invoice_number: invoiceNumber,
      status: 'draft',
      currency: cleanText(body.currency) || reservations[0]?.currency || 'GBP',
      subtotal_sold: totals.subtotalSold,
      discount_total: totals.discountTotal,
      total_sold: totals.totalSold,
      total_paid: totals.totalPaid,
      balance_due: totals.balanceDue,
      total_booked_cost: totals.totalBookedCost,
      projected_margin: totals.projectedMargin,
      expected_commission_total: totals.expectedCommissionTotal,
      received_commission_total: totals.receivedCommissionTotal,
      released_to_customer: false,
      customer_terms: cleanText(body.customerTerms) || null,
      internal_notes: cleanText(body.internalNotes) || null,
      metadata: { source: 'reservations' },
    })
    .select(selectTravelPackageInvoiceColumns())
    .single()

  if (invoiceError || !invoiceData) {
    if (isInvoiceSchemaError(invoiceError)) return apiError(SCHEMA_HINT, 503)
    return apiError(invoiceError?.message || 'Failed to create package invoice', 500)
  }

  let createdLines: TravelPackageInvoiceLine[] = []
  if (invoiceLines.length > 0) {
    const { data: lineData, error: lineError } = await supabase
      .from('travel_package_invoice_lines')
      .insert(
        invoiceLines.map((line) => ({
          ...line,
          invoice_id: (invoiceData as unknown as { id: string }).id,
        })),
      )
      .select(selectTravelPackageInvoiceLineColumns())

    if (lineError) {
      if (isInvoiceSchemaError(lineError)) return apiError(SCHEMA_HINT, 503)
      return apiError(lineError.message || 'Failed to create package invoice lines', 500)
    }
    createdLines = (lineData || []) as unknown as TravelPackageInvoiceLine[]
  }

  await syncPackageInvoiceStatus(supabase, id, 'draft', false)

  return apiOk(
    {
      invoice: withLines(invoiceData as unknown as TravelPackageInvoice, createdLines),
      setupRequired: false,
    },
    { status: 201 },
  )
}

export async function PATCH(
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
  const invoiceId = cleanText(getBodyValue(body, 'invoiceId', 'invoice_id'))
  if (!invoiceId) return apiError('Invoice ID is required', 400)

  const { data: existingData, error: existingError } = await supabase
    .from('travel_package_invoices')
    .select(selectTravelPackageInvoiceColumns())
    .eq('id', invoiceId)
    .eq('package_id', id)
    .single()

  if (existingError || !existingData) {
    if (isInvoiceSchemaError(existingError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Package invoice not found', 404)
  }

  const existingInvoice = existingData as unknown as TravelPackageInvoice
  const subtotalSold = hasBodyKey(body, 'subtotalSold')
    ? roundPackageInvoiceMoney(body.subtotalSold)
    : hasBodyKey(body, 'subtotal_sold')
      ? roundPackageInvoiceMoney(body.subtotal_sold)
      : roundPackageInvoiceMoney(existingInvoice.subtotal_sold)
  const discountTotal = hasBodyKey(body, 'discountTotal')
    ? roundPackageInvoiceMoney(body.discountTotal)
    : hasBodyKey(body, 'discount_total')
      ? roundPackageInvoiceMoney(body.discount_total)
      : roundPackageInvoiceMoney(existingInvoice.discount_total)
  const totalPaid = hasBodyKey(body, 'totalPaid')
    ? roundPackageInvoiceMoney(body.totalPaid)
    : hasBodyKey(body, 'total_paid')
      ? roundPackageInvoiceMoney(body.total_paid)
      : roundPackageInvoiceMoney(existingInvoice.total_paid)
  const totalBookedCost = hasBodyKey(body, 'totalBookedCost')
    ? roundPackageInvoiceMoney(body.totalBookedCost)
    : hasBodyKey(body, 'total_booked_cost')
      ? roundPackageInvoiceMoney(body.total_booked_cost)
      : roundPackageInvoiceMoney(existingInvoice.total_booked_cost)
  const expectedCommissionTotal = hasBodyKey(body, 'expectedCommissionTotal')
    ? roundPackageInvoiceMoney(body.expectedCommissionTotal)
    : hasBodyKey(body, 'expected_commission_total')
      ? roundPackageInvoiceMoney(body.expected_commission_total)
      : roundPackageInvoiceMoney(existingInvoice.expected_commission_total)
  const receivedCommissionTotal = hasBodyKey(body, 'receivedCommissionTotal')
    ? roundPackageInvoiceMoney(body.receivedCommissionTotal)
    : hasBodyKey(body, 'received_commission_total')
      ? roundPackageInvoiceMoney(body.received_commission_total)
      : roundPackageInvoiceMoney(existingInvoice.received_commission_total)
  const status = INVOICE_STATUSES.has(cleanText(body.status) as TravelPackageInvoiceStatus)
    ? (cleanText(body.status) as TravelPackageInvoiceStatus)
    : existingInvoice.status
  const releasedToCustomer = hasBodyKey(body, 'releasedToCustomer')
    ? Boolean(body.releasedToCustomer)
    : hasBodyKey(body, 'released_to_customer')
      ? Boolean(body.released_to_customer)
      : existingInvoice.released_to_customer
  const totalSold = roundPackageInvoiceMoney(subtotalSold - discountTotal)
  const balanceDue = roundPackageInvoiceMoney(totalSold - totalPaid)
  const projectedMargin = roundPackageInvoiceMoney(
    totalSold - totalBookedCost + expectedCommissionTotal,
  )
  const releaseStarted = releasedToCustomer && !existingInvoice.released_to_customer
  const shouldRelease = releasedToCustomer || status === 'released'

  const updatePayload = {
    updated_by: user.id,
    status: shouldRelease ? 'released' : status,
    subtotal_sold: subtotalSold,
    discount_total: discountTotal,
    total_sold: totalSold,
    total_paid: totalPaid,
    balance_due: balanceDue,
    total_booked_cost: totalBookedCost,
    projected_margin: projectedMargin,
    expected_commission_total: expectedCommissionTotal,
    received_commission_total: receivedCommissionTotal,
    released_to_customer: shouldRelease,
    released_at: shouldRelease
      ? existingInvoice.released_at || new Date().toISOString()
      : null,
    released_by: shouldRelease ? existingInvoice.released_by || user.id : null,
    version: releaseStarted ? existingInvoice.version + 1 : existingInvoice.version,
    customer_terms: hasBodyKey(body, 'customerTerms')
      ? cleanText(body.customerTerms) || null
      : hasBodyKey(body, 'customer_terms')
        ? cleanText(body.customer_terms) || null
        : existingInvoice.customer_terms,
    internal_notes: hasBodyKey(body, 'internalNotes')
      ? cleanText(body.internalNotes) || null
      : hasBodyKey(body, 'internal_notes')
        ? cleanText(body.internal_notes) || null
        : existingInvoice.internal_notes,
    voided_at: status === 'void' ? existingInvoice.voided_at || new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('travel_package_invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .eq('package_id', id)
    .select(selectTravelPackageInvoiceColumns())
    .single()

  if (error || !data) {
    if (isInvoiceSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to update package invoice', 500)
  }

  await syncPackageInvoiceStatus(
    supabase,
    id,
    (data as unknown as TravelPackageInvoice).status,
    (data as unknown as TravelPackageInvoice).released_to_customer,
  )

  const { data: lineData } = await loadInvoiceLines(supabase, id, invoiceId)

  return apiOk({
    invoice: withLines(
      data as unknown as TravelPackageInvoice,
      (lineData || []) as unknown as TravelPackageInvoiceLine[],
    ),
    setupRequired: false,
  })
}
