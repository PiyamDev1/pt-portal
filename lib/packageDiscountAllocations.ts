import type {
  PackageDiscountEligibleService,
  PackageLimitedTimeOffer,
  PackageQuoteDiscountType,
  PackageQuotePayload,
  TravelPackageFolder,
  TravelPackageReservation,
  TravelPackageReservationDiscountAllocation,
} from '@/app/types/packages'
import {
  getPackageOfferDiscountTotal,
  getPackageQuoteDiscountEligibleServices,
  getPackageQuoteDiscountType,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'

type PackageDiscountSnapshot = TravelPackageFolder['selected_quote_snapshot'] | null | undefined

type AllocationSource = {
  offer: PackageLimitedTimeOffer
  discountType: PackageQuoteDiscountType
  amount: number
  eligibleServices: PackageDiscountEligibleService[]
}

function money(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

function reservationProfit(reservation: TravelPackageReservation) {
  return money(
    Number(reservation.sold_price_total || 0) -
      Number(reservation.discount_total || 0) -
      Number(reservation.booked_cost_total || 0) +
      Number(reservation.commission_expected_total || 0),
  )
}

function isServiceReservation(reservation: TravelPackageReservation) {
  return ['flight', 'hotel', 'transport', 'visa'].includes(reservation.reservation_type)
}

function getAppliedOffers(snapshot: PackageDiscountSnapshot, payload: PackageQuotePayload) {
  const appliedOffers = snapshot?.selection?.combination?.appliedOffers
  if (Array.isArray(appliedOffers) && appliedOffers.length > 0) return appliedOffers
  return payload.limitedTimeOffers.filter((offer) => offer.active !== false)
}

function getQuoteDiscountTotal(
  snapshot: PackageDiscountSnapshot,
  reservations: TravelPackageReservation[],
  calculatedTotal: number,
  refundAdjustmentTotal: number,
) {
  const snapshotTotal = Number(snapshot?.selection?.combination?.offerDiscountTotal)
  if (Number.isFinite(snapshotTotal) && snapshotTotal > 0) {
    return money(Math.max(0, snapshotTotal - refundAdjustmentTotal))
  }

  const legacyAdjustment = reservations.find((reservation) => {
    const metadata = reservation.metadata || {}
    return (
      reservation.reservation_type === 'other' &&
      metadata.source === 'final_quote_selection' &&
      metadata.adjustmentType === 'discount'
    )
  })
  return money(Math.max(calculatedTotal, Number(legacyAdjustment?.discount_total || 0)))
}

function createEmptyAllocation(
  reservation: TravelPackageReservation,
): TravelPackageReservationDiscountAllocation {
  const basisProfit = reservationProfit(reservation)
  return {
    earlyBirdTotal: 0,
    generalDiscountTotal: 0,
    visaSpecialTotal: 0,
    total: 0,
    basisProfit,
    remainingProfit: basisProfit,
    allocationPercentage: 0,
    sources: [],
  }
}

function allocateMoney(
  amount: number,
  reservations: TravelPackageReservation[],
  allocations: Record<string, TravelPackageReservationDiscountAllocation>,
) {
  const totalCents = Math.max(0, Math.round(amount * 100))
  if (totalCents === 0 || reservations.length === 0) return new Map<string, number>()

  const candidates = reservations.map((reservation) => {
    const allocation = allocations[reservation.id]
    const remainingProfit = Math.max(0, allocation.basisProfit - allocation.total)
    const remainingSold = Math.max(
      0,
      Number(reservation.sold_price_total || 0) -
        Number(reservation.discount_total || 0) -
        allocation.total,
    )
    return { reservation, remainingProfit, remainingSold }
  })
  const totalRemainingProfit = candidates.reduce((sum, item) => sum + item.remainingProfit, 0)
  const weights = candidates.map((item) => ({
    reservation: item.reservation,
    weight: totalRemainingProfit > 0 ? item.remainingProfit : item.remainingSold,
  }))
  let totalWeight = weights.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) {
    weights.forEach((item) => {
      item.weight = 1
    })
    totalWeight = weights.length
  }

  const provisional = weights.map((item) => {
    const exactCents = (totalCents * item.weight) / totalWeight
    const cents = Math.floor(exactCents)
    return { ...item, cents, remainder: exactCents - cents }
  })
  let remainingCents = totalCents - provisional.reduce((sum, item) => sum + item.cents, 0)
  provisional
    .sort((a, b) => b.remainder - a.remainder || a.reservation.id.localeCompare(b.reservation.id))
    .forEach((item) => {
      if (remainingCents <= 0) return
      item.cents += 1
      remainingCents -= 1
    })

  return new Map(provisional.map((item) => [item.reservation.id, item.cents / 100]))
}

function addSourceAllocation(
  allocation: TravelPackageReservationDiscountAllocation,
  source: AllocationSource,
  amount: number,
) {
  const roundedAmount = money(amount)
  if (roundedAmount <= 0) return
  if (source.discountType === 'visa_special') allocation.visaSpecialTotal += roundedAmount
  else if (source.discountType === 'general_discount') {
    allocation.generalDiscountTotal += roundedAmount
  } else allocation.earlyBirdTotal += roundedAmount
  allocation.total = money(allocation.total + roundedAmount)
  allocation.remainingProfit = money(allocation.basisProfit - allocation.total)
  allocation.sources.push({
    offerId: source.offer.id,
    title: source.offer.title,
    discountType: source.discountType,
    amount: roundedAmount,
  })
}

function visaReservationMatchesOffer(
  reservation: TravelPackageReservation,
  offer: PackageLimitedTimeOffer,
) {
  if (reservation.reservation_type !== 'visa') return false
  const metadata = reservation.metadata || {}
  if (offer.visaOptionId && metadata.optionId === offer.visaOptionId) return true
  if (
    offer.visaPassengerCategory &&
    offer.visaPassengerCategory !== 'all' &&
    metadata.visaPassengerCategory === offer.visaPassengerCategory
  ) {
    return true
  }
  return !offer.visaOptionId && !offer.visaPassengerCategory
}

export function calculateTravelPackageDiscountAllocations(
  reservations: TravelPackageReservation[],
  snapshot: PackageDiscountSnapshot,
) {
  const allocations = Object.fromEntries(
    reservations.map((reservation) => [reservation.id, createEmptyAllocation(reservation)]),
  ) as Record<string, TravelPackageReservationDiscountAllocation>
  const payload = normalizePackageQuotePayload(snapshot?.payload || {})
  const offers = getAppliedOffers(snapshot, payload)
  const refundAdjustmentTotal = money(
    offers
      .filter((offer) => getPackageQuoteDiscountType(offer) === 'refund_adjustment')
      .reduce((total, offer) => total + getPackageOfferDiscountTotal(offer, payload), 0),
  )
  const configuredSources: AllocationSource[] = offers
    .filter((offer) => getPackageQuoteDiscountType(offer) !== 'refund_adjustment')
    .map((offer) => ({
      offer,
      discountType: getPackageQuoteDiscountType(offer),
      amount: getPackageOfferDiscountTotal(offer, payload),
      eligibleServices: getPackageQuoteDiscountEligibleServices(offer),
    }))
  const configuredTotal = money(configuredSources.reduce((sum, source) => sum + source.amount, 0))
  const quoteDiscountTotal = getQuoteDiscountTotal(
    snapshot,
    reservations,
    configuredTotal,
    refundAdjustmentTotal,
  )
  const residual = money(Math.max(0, quoteDiscountTotal - configuredTotal))
  const sources = [...configuredSources]
  if (residual > 0) {
    sources.push({
      offer: {
        id: 'legacy-package-discount',
        title: 'Package discount',
        summary: '',
        expiresAt: '',
        discountAmount: residual,
        discountMode: 'total',
        discountType: 'general_discount',
        eligibleServices: ['flight', 'hotel', 'transport'],
        active: true,
      },
      discountType: 'general_discount',
      amount: residual,
      eligibleServices: ['flight', 'hotel', 'transport'],
    })
  }

  const serviceReservations = reservations.filter(
    (reservation) => isServiceReservation(reservation) && reservation.status !== 'failed',
  )
  const orderedSources = [...sources].sort((a, b) => {
    const order: Record<PackageQuoteDiscountType, number> = {
      early_bird: 0,
      general_discount: 1,
      visa_special: 2,
      refund_adjustment: 3,
    }
    return order[a.discountType] - order[b.discountType]
  })

  orderedSources.forEach((source) => {
    if (source.amount <= 0) return
    let candidates = serviceReservations.filter((reservation) => {
      if (source.discountType === 'visa_special') {
        return visaReservationMatchesOffer(reservation, source.offer)
      }
      return source.eligibleServices.includes(
        reservation.reservation_type as PackageDiscountEligibleService,
      )
    })
    if (source.discountType === 'visa_special' && candidates.length === 0) {
      candidates = serviceReservations.filter(
        (reservation) => reservation.reservation_type === 'visa',
      )
    }
    if (source.discountType !== 'visa_special' && candidates.length === 0) {
      candidates = serviceReservations.filter((reservation) =>
        ['flight', 'hotel', 'transport'].includes(reservation.reservation_type),
      )
    }

    allocateMoney(source.amount, candidates, allocations).forEach((amount, reservationId) => {
      addSourceAllocation(allocations[reservationId], source, amount)
    })
  })

  const totalAllocatedDiscount = serviceReservations.reduce(
    (sum, reservation) => sum + allocations[reservation.id].total,
    0,
  )
  serviceReservations.forEach((reservation) => {
    const allocation = allocations[reservation.id]
    allocation.earlyBirdTotal = money(allocation.earlyBirdTotal)
    allocation.generalDiscountTotal = money(allocation.generalDiscountTotal)
    allocation.visaSpecialTotal = money(allocation.visaSpecialTotal)
    allocation.total = money(allocation.total)
    allocation.remainingProfit = money(allocation.basisProfit - allocation.total)
    allocation.allocationPercentage =
      totalAllocatedDiscount > 0 ? money((allocation.total / totalAllocatedDiscount) * 100) : 0
  })

  return allocations
}
