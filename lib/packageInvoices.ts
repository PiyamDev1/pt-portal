import type {
  TravelPackageInvoiceLine,
  TravelPackageInvoiceLineType,
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationType,
} from '@/app/types/packages'

export const PACKAGE_INVOICE_LINE_TYPES: Array<{
  value: TravelPackageInvoiceLineType
  label: string
}> = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transport', label: 'Transport' },
  { value: 'discount', label: 'Discount' },
  { value: 'commission', label: 'Commission' },
  { value: 'other', label: 'Other' },
]

export const PACKAGE_INVOICE_LINE_TYPE_VALUES = new Set(
  PACKAGE_INVOICE_LINE_TYPES.map((lineType) => lineType.value),
)

export function roundPackageInvoiceMoney(value: unknown) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 0
  return Math.round(number * 100) / 100
}

export function createPackageInvoiceNumber(packageReference: string) {
  const cleanReference = packageReference.trim().replace(/[^A-Z0-9-]/gi, '').toUpperCase()
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `INV-${cleanReference || 'PT'}-${token}`
}

export function normalizePackageInvoiceLineType(
  value: unknown,
  fallback: TravelPackageInvoiceLineType = 'other',
) {
  return PACKAGE_INVOICE_LINE_TYPE_VALUES.has(value as TravelPackageInvoiceLineType)
    ? (value as TravelPackageInvoiceLineType)
    : fallback
}

export function reservationTypeToInvoiceLineType(
  reservationType: TravelPackageReservationType,
): TravelPackageInvoiceLineType {
  if (reservationType === 'flight') return 'flight'
  if (reservationType === 'hotel') return 'hotel'
  if (reservationType === 'visa') return 'visa'
  if (reservationType === 'transport') return 'transport'
  return 'other'
}

export function calculatePackageInvoiceTotals(
  lines: Array<
    Pick<
      TravelPackageInvoiceLine,
      | 'total_sold_price'
      | 'discount_amount'
      | 'total_booked_cost'
      | 'expected_commission'
      | 'received_commission'
    >
  >,
  totalPaid = 0,
) {
  const subtotalSold = roundPackageInvoiceMoney(
    lines.reduce((total, line) => total + Number(line.total_sold_price || 0), 0),
  )
  const discountTotal = roundPackageInvoiceMoney(
    lines.reduce((total, line) => total + Number(line.discount_amount || 0), 0),
  )
  const totalBookedCost = roundPackageInvoiceMoney(
    lines.reduce((total, line) => total + Number(line.total_booked_cost || 0), 0),
  )
  const expectedCommissionTotal = roundPackageInvoiceMoney(
    lines.reduce((total, line) => total + Number(line.expected_commission || 0), 0),
  )
  const receivedCommissionTotal = roundPackageInvoiceMoney(
    lines.reduce((total, line) => total + Number(line.received_commission || 0), 0),
  )
  const paid = roundPackageInvoiceMoney(totalPaid)
  const totalSold = roundPackageInvoiceMoney(subtotalSold - discountTotal)
  const balanceDue = roundPackageInvoiceMoney(totalSold - paid)
  const projectedMargin = roundPackageInvoiceMoney(
    totalSold - totalBookedCost + expectedCommissionTotal,
  )

  return {
    subtotalSold,
    discountTotal,
    totalSold,
    totalPaid: paid,
    balanceDue,
    totalBookedCost,
    projectedMargin,
    expectedCommissionTotal,
    receivedCommissionTotal,
  }
}

export function createPackageInvoiceLinesFromReservations(
  reservations: TravelPackageReservation[],
) {
  const lines: Array<{
    package_id: string
    reservation_id: string
    reservation_item_id: string | null
    line_type: TravelPackageInvoiceLineType
    description: string
    quantity: number
    unit_sold_price: number
    total_sold_price: number
    unit_booked_cost: number
    total_booked_cost: number
    discount_amount: number
    expected_commission: number
    received_commission: number
    customer_visible: boolean
    sort_order: number
    metadata: Record<string, unknown>
  }> = []

  reservations.forEach((reservation, reservationIndex) => {
    const reservationItems = reservation.items || []
    if (reservationItems.length > 0) {
      reservationItems.forEach((item, itemIndex) => {
        lines.push(createLineFromReservationItem(reservation, item, reservationIndex, itemIndex))
      })
      return
    }

    lines.push({
      package_id: reservation.package_id,
      reservation_id: reservation.id,
      reservation_item_id: null,
      line_type: reservationTypeToInvoiceLineType(reservation.reservation_type),
      description: reservation.title,
      quantity: 1,
      unit_sold_price: roundPackageInvoiceMoney(reservation.sold_price_total),
      total_sold_price: roundPackageInvoiceMoney(reservation.sold_price_total),
      unit_booked_cost: roundPackageInvoiceMoney(reservation.booked_cost_total),
      total_booked_cost: roundPackageInvoiceMoney(reservation.booked_cost_total),
      discount_amount: roundPackageInvoiceMoney(reservation.discount_total),
      expected_commission: roundPackageInvoiceMoney(reservation.commission_expected_total),
      received_commission: roundPackageInvoiceMoney(reservation.commission_received_total),
      customer_visible: true,
      sort_order: reservationIndex * 100,
      metadata: {
        source: 'reservation',
        supplierName: reservation.supplier_name,
        supplierReference: reservation.supplier_reference,
      },
    })
  })

  return lines
}

function createLineFromReservationItem(
  reservation: TravelPackageReservation,
  item: TravelPackageReservationItem,
  reservationIndex: number,
  itemIndex: number,
) {
  return {
    package_id: reservation.package_id,
    reservation_id: reservation.id,
    reservation_item_id: item.id,
    line_type: normalizePackageInvoiceLineType(
      item.item_type,
      reservationTypeToInvoiceLineType(reservation.reservation_type),
    ),
    description: item.title,
    quantity: roundPackageInvoiceMoney(item.quantity || 1),
    unit_sold_price: roundPackageInvoiceMoney(item.unit_sold_price),
    total_sold_price: roundPackageInvoiceMoney(item.total_sold_price),
    unit_booked_cost: roundPackageInvoiceMoney(item.unit_booked_cost),
    total_booked_cost: roundPackageInvoiceMoney(item.total_booked_cost),
    discount_amount: roundPackageInvoiceMoney(item.discount_amount),
    expected_commission: roundPackageInvoiceMoney(item.commission_expected_amount),
    received_commission: roundPackageInvoiceMoney(item.commission_received_amount),
    customer_visible: true,
    sort_order: reservationIndex * 100 + itemIndex,
    metadata: {
      source: 'reservation_item',
      supplierReference: item.supplier_reference,
    },
  }
}
