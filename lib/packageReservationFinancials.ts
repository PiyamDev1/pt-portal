import type { TravelPackageReservation } from '@/app/types/packages'

export type ReservationCalculationRole = 'standard' | 'group_main_transport' | 'invoice_reference'

export type ReservationCalculationLine = {
  role: ReservationCalculationRole
  included: boolean
  booked: number
  sold: number
  discount: number
  commission: number
  supplierRefund: number
  customerRefund: number
}

function roundReservationMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100
}

export function isGroupMainTransportReservation(reservation: TravelPackageReservation) {
  return (
    reservation.reservation_type === 'transport' &&
    reservation.metadata?.sharedGroupTransport === true &&
    reservation.metadata?.physicalReservation === true
  )
}

export function isSharedTransportInvoiceReference(reservation: TravelPackageReservation) {
  return (
    reservation.reservation_type === 'transport' &&
    reservation.metadata?.sharedGroupTransport === true &&
    reservation.metadata?.billingAllocation === true &&
    reservation.metadata?.physicalReservation !== true
  )
}

export function getGroupMainTransportDerivedSold(
  reservation: TravelPackageReservation,
  reservations: TravelPackageReservation[],
) {
  if (!isGroupMainTransportReservation(reservation)) {
    return Number(reservation.sold_price_total || 0)
  }
  return roundReservationMoney(
    reservations
      .filter(isSharedTransportInvoiceReference)
      .reduce((total, reference) => total + Number(reference.sold_price_total || 0), 0),
  )
}

export function getSharedTransportReferenceBookedCost(
  reference: TravelPackageReservation,
  reservations: TravelPackageReservation[],
) {
  if (!isSharedTransportInvoiceReference(reference)) {
    return Number(reference.booked_cost_total || 0)
  }
  const main = reservations.find(isGroupMainTransportReservation)
  if (!main) return 0
  const allocations = Array.isArray(main.metadata?.familyAllocations)
    ? (main.metadata.familyAllocations as Array<Record<string, unknown>>)
    : []
  const matchingIndex = allocations.findIndex(
    (allocation) =>
      (reference.quote_id && String(allocation.quoteId || '') === reference.quote_id) ||
      (reference.group_member_id &&
        String(allocation.groupMemberId || '') === reference.group_member_id),
  )
  if (matchingIndex < 0 || allocations.length === 0) return 0
  const passengerWeights = allocations.map((allocation) =>
    Math.max(0, Number(allocation.passengerCount || 0)),
  )
  const soldWeights = allocations.map((allocation) =>
    Math.max(0, Number(allocation.soldPrice || 0)),
  )
  const weights = passengerWeights.some((weight) => weight > 0)
    ? passengerWeights
    : soldWeights.some((weight) => weight > 0)
      ? soldWeights
      : allocations.map(() => 1)
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const totalBooked = roundReservationMoney(Number(main.booked_cost_total || 0))
  let allocated = 0
  const amounts = weights.map((weight, index) => {
    const amount =
      index === weights.length - 1
        ? roundReservationMoney(totalBooked - allocated)
        : roundReservationMoney(totalWeight > 0 ? (totalBooked * weight) / totalWeight : 0)
    allocated = roundReservationMoney(allocated + amount)
    return amount
  })
  return amounts[matchingIndex] || 0
}

export function getReservationCalculationLine(
  reservation: TravelPackageReservation,
  reservations: TravelPackageReservation[],
): ReservationCalculationLine {
  if (isSharedTransportInvoiceReference(reservation)) {
    return {
      role: 'invoice_reference',
      included: false,
      booked: 0,
      sold: 0,
      discount: 0,
      commission: 0,
      supplierRefund: 0,
      customerRefund: 0,
    }
  }
  if (isGroupMainTransportReservation(reservation)) {
    const references = reservations.filter(isSharedTransportInvoiceReference)
    return {
      role: 'group_main_transport',
      included: true,
      booked: Number(reservation.booked_cost_total || 0),
      sold:
        reservation.metadata?.soldPriceOverride === true
          ? Number(reservation.sold_price_total || 0)
          : getGroupMainTransportDerivedSold(reservation, reservations),
      discount:
        Number(reservation.discount_total || 0) +
        references.reduce((total, item) => total + Number(item.discount_total || 0), 0),
      commission:
        Number(reservation.commission_expected_total || 0) +
        references.reduce((total, item) => total + Number(item.commission_expected_total || 0), 0),
      supplierRefund:
        Number(reservation.supplier_refund_total || 0) +
        references.reduce((total, item) => total + Number(item.supplier_refund_total || 0), 0),
      customerRefund:
        Number(reservation.customer_refund_total || 0) +
        references.reduce((total, item) => total + Number(item.customer_refund_total || 0), 0),
    }
  }
  return {
    role: 'standard',
    included: true,
    booked: Number(reservation.booked_cost_total || 0),
    sold: Number(reservation.sold_price_total || 0),
    discount: Number(reservation.discount_total || 0),
    commission: Number(reservation.commission_expected_total || 0),
    supplierRefund: Number(reservation.supplier_refund_total || 0),
    customerRefund: Number(reservation.customer_refund_total || 0),
  }
}

export function getReservationCalculationTotals(reservations: TravelPackageReservation[]) {
  return reservations.reduce(
    (totals, reservation) => {
      const line = getReservationCalculationLine(reservation, reservations)
      if (!line.included) {
        totals.referenceRows += 1
        return totals
      }
      totals.calculationRows += 1
      totals.booked += Math.max(0, line.booked - line.supplierRefund)
      totals.sold += Math.max(0, line.sold - line.customerRefund)
      totals.discount += line.discount
      totals.commission += line.commission
      totals.supplierRefund += line.supplierRefund
      totals.customerRefund += line.customerRefund
      return totals
    },
    {
      booked: 0,
      sold: 0,
      discount: 0,
      commission: 0,
      supplierRefund: 0,
      customerRefund: 0,
      calculationRows: 0,
      referenceRows: 0,
    },
  )
}

export function getPackageReservationSaleTotal(reservations: TravelPackageReservation[]) {
  const totals = getReservationCalculationTotals(reservations)
  return roundReservationMoney(totals.sold - totals.discount)
}
