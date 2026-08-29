import type {
  TravelPackageInvoice,
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
  const cleanReference = packageReference
    .trim()
    .replace(/[^A-Z0-9-]/gi, '')
    .toUpperCase()
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
    } else {
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
    }

    const customerRefund = roundPackageInvoiceMoney(reservation.customer_refund_total)
    if (customerRefund > 0) {
      lines.push({
        package_id: reservation.package_id,
        reservation_id: reservation.id,
        reservation_item_id: null,
        line_type: 'other',
        description: `${reservation.title} - customer refund`,
        quantity: 1,
        unit_sold_price: -customerRefund,
        total_sold_price: -customerRefund,
        unit_booked_cost: 0,
        total_booked_cost: 0,
        discount_amount: 0,
        expected_commission: 0,
        received_commission: 0,
        customer_visible: true,
        sort_order: reservationIndex * 100 + 98,
        metadata: { source: 'reservation_refund', refundKind: 'customer' },
      })
    }

    const supplierRefund = roundPackageInvoiceMoney(reservation.supplier_refund_total)
    if (supplierRefund > 0) {
      lines.push({
        package_id: reservation.package_id,
        reservation_id: reservation.id,
        reservation_item_id: null,
        line_type: 'other',
        description: `${reservation.title} - supplier credit`,
        quantity: 1,
        unit_sold_price: 0,
        total_sold_price: 0,
        unit_booked_cost: -supplierRefund,
        total_booked_cost: -supplierRefund,
        discount_amount: 0,
        expected_commission: 0,
        received_commission: 0,
        customer_visible: false,
        sort_order: reservationIndex * 100 + 99,
        metadata: { source: 'reservation_refund', refundKind: 'supplier' },
      })
    }
  })

  return lines
}

export function allocateSharedGroupTransportBookedCost(
  familyReservations: TravelPackageReservation[],
  packageReservations: TravelPackageReservation[],
  quoteId: string,
) {
  const allocated = familyReservations.map((reservation) => ({ ...reservation }))

  packageReservations.forEach((physicalReservation) => {
    const metadata = physicalReservation.metadata || {}
    if (
      physicalReservation.reservation_type !== 'transport' ||
      metadata.physicalReservation !== true ||
      metadata.sharedGroupTransport !== true
    ) {
      return
    }

    const familyAllocations = Array.isArray(metadata.familyAllocations)
      ? (metadata.familyAllocations as Array<Record<string, unknown>>)
      : []
    const matchingAllocation = familyAllocations.find(
      (allocation) => String(allocation.quoteId || '') === quoteId,
    )
    if (!matchingAllocation || familyAllocations.length === 0) return

    const bookedCost = roundPackageInvoiceMoney(physicalReservation.booked_cost_total)
    const storedAllocatedCost = Number(matchingAllocation.bookedCost)
    const passengerWeight = Math.max(0, Number(matchingAllocation.passengerCount || 0))
    const totalPassengerWeight = familyAllocations.reduce(
      (total, allocation) => total + Math.max(0, Number(allocation.passengerCount || 0)),
      0,
    )
    const legacySoldWeight = Math.max(0, Number(matchingAllocation.soldPrice || 0))
    const totalLegacySoldWeight = familyAllocations.reduce(
      (total, allocation) => total + Math.max(0, Number(allocation.soldPrice || 0)),
      0,
    )
    const originalBookedCost = Number(metadata.transportNetCost)
    const storedAllocationMatchesPhysicalCost =
      Number.isFinite(storedAllocatedCost) &&
      Number.isFinite(originalBookedCost) &&
      roundPackageInvoiceMoney(originalBookedCost) === bookedCost
    const allocatedCost = storedAllocationMatchesPhysicalCost
      ? roundPackageInvoiceMoney(storedAllocatedCost)
      : roundPackageInvoiceMoney(
          totalPassengerWeight > 0
            ? (bookedCost * passengerWeight) / totalPassengerWeight
            : totalLegacySoldWeight > 0
              ? (bookedCost * legacySoldWeight) / totalLegacySoldWeight
              : bookedCost / familyAllocations.length,
        )
    const optionId = String(matchingAllocation.referenceOptionId || metadata.optionId || '')
    const targetIndex = allocated.findIndex((reservation) => {
      const reservationMetadata = reservation.metadata || {}
      return (
        reservation.reservation_type === 'transport' &&
        reservationMetadata.billingAllocation === true &&
        (!optionId || !reservationMetadata.optionId || reservationMetadata.optionId === optionId)
      )
    })
    if (targetIndex < 0) return

    allocated[targetIndex] = {
      ...allocated[targetIndex],
      booked_cost_total: allocatedCost,
    }
  })

  return allocated
}

export function createCustomerInvoiceSnapshot(
  invoice: TravelPackageInvoice,
  lines: TravelPackageInvoiceLine[],
) {
  return {
    id: invoice.id,
    package_id: invoice.package_id,
    quote_id: invoice.quote_id,
    invoice_number: invoice.invoice_number,
    currency: invoice.currency,
    subtotal_sold: roundPackageInvoiceMoney(invoice.subtotal_sold),
    discount_total: roundPackageInvoiceMoney(invoice.discount_total),
    total_sold: roundPackageInvoiceMoney(invoice.total_sold),
    total_paid: roundPackageInvoiceMoney(invoice.total_paid),
    balance_due: roundPackageInvoiceMoney(invoice.balance_due),
    customer_terms: invoice.customer_terms,
    due_at: invoice.due_at || null,
    version: invoice.version,
    lines: lines
      .filter((line) => line.customer_visible)
      .map((line) => ({
        id: line.id,
        line_type: line.line_type,
        description: line.description,
        quantity: roundPackageInvoiceMoney(line.quantity),
        unit_sold_price: roundPackageInvoiceMoney(line.unit_sold_price),
        total_sold_price: roundPackageInvoiceMoney(line.total_sold_price),
        discount_amount: roundPackageInvoiceMoney(line.discount_amount),
        sort_order: line.sort_order,
      })),
  }
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
