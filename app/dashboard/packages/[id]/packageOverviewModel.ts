import type {
  PackageCombination,
  PackageComponentOption,
  PackageQuotePayload,
  PackageVisaPassengerCategory,
  TravelPackageDocument,
  TravelPackageFolder,
  TravelPackageInvoice,
  TravelPackageInvoiceStatus,
  TravelPackageReservation,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
} from '@/app/types/packages'
import { THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES } from '@/lib/packageDocuments'
import type {
  InvoiceFormState,
  ReservationDetailFormState,
  ReservationFinancialFormState,
  ReservationFormState,
  ReservationItemFormState,
  ReservationRefundFormState,
  ThirdPartyShareFormState,
} from './packageOverviewTypes'

const VISA_PHOTO_DOCUMENT_KIND = 'visa_photo'

function isVisaPhotoDocument(document: TravelPackageDocument) {
  return document.metadata?.documentKind === VISA_PHOTO_DOCUMENT_KIND
}

function getLinkedVisaPhotoParentId(document: TravelPackageDocument) {
  const linkedDocumentId = document.metadata?.linkedTravelDocumentId
  return typeof linkedDocumentId === 'string' ? linkedDocumentId : ''
}

const reservationTypeOptions: Array<{ value: TravelPackageReservationType; label: string }> = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

const reservationStatusOptions: Array<{ value: TravelPackageReservationStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'quote_requested', label: 'Quote requested' },
  { value: 'availability_checked', label: 'Availability checked' },
  { value: 'reservation_pending', label: 'Reservation pending' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'deposit_required', label: 'Deposit required' },
  { value: 'paid', label: 'Paid' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'changed', label: 'Changed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
]

const reservationItemTypeOptions: Array<{
  value: TravelPackageReservationItemType
  label: string
}> = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transport', label: 'Transport' },
  { value: 'commission', label: 'Commission' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
]

const reservationItemStatusOptions: Array<{
  value: TravelPackageReservationItemStatus
  label: string
}> = [
  { value: 'draft', label: 'Draft' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'changed', label: 'Changed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const invoiceStatusOptions: Array<{ value: TravelPackageInvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'finalised', label: 'Finalised' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'released', label: 'Released (customer snapshot live)' },
  { value: 'amended', label: 'Amended draft' },
  { value: 'void', label: 'Void' },
  { value: 'closed', label: 'Closed' },
]

const CUSTOMER_PORTAL_URL = 'https://bookings.piyamtravel.com'

function toDateTimeLocalValue(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function createInitialReservationForm(soldPriceTotal = 0): ReservationFormState {
  return {
    reservationType: 'flight',
    title: '',
    status: 'reservation_pending',
    supplierName: '',
    supplierReference: '',
    bookedCostTotal: '',
    soldPriceTotal: soldPriceTotal > 0 ? String(soldPriceTotal) : '',
    discountTotal: '',
    commissionExpectedTotal: '',
    depositRequired: false,
    depositAmount: '',
    paymentDueAt: toDateTimeLocalValue(),
    internalNotes: '',
  }
}

function createInitialReservationRefundForm(): ReservationRefundFormState {
  return {
    refundKind: 'supplier',
    amount: '',
    paymentMethod: 'bank_transfer',
    reference: '',
    reason: '',
  }
}

function createInitialReservationItemForm(
  itemType: TravelPackageReservationItemType = 'other',
): ReservationItemFormState {
  return {
    itemType,
    title: '',
    status: 'draft',
    quantity: '1',
    unitBookedCost: '',
    unitSoldPrice: '',
    discountAmount: '',
    commissionExpectedAmount: '',
    supplierReference: '',
    description: '',
  }
}

function createInitialInvoiceForm(invoice?: TravelPackageInvoice | null): InvoiceFormState {
  return {
    status: invoice?.status || 'draft',
    subtotalSold: invoice ? String(invoice.subtotal_sold || '') : '',
    discountTotal: invoice ? String(invoice.discount_total || '') : '',
    totalPaid: invoice ? String(invoice.total_paid || '') : '',
    totalBookedCost: invoice ? String(invoice.total_booked_cost || '') : '',
    expectedCommissionTotal: invoice ? String(invoice.expected_commission_total || '') : '',
    receivedCommissionTotal: invoice ? String(invoice.received_commission_total || '') : '',
    releasedToCustomer: Boolean(invoice?.released_to_customer),
    customerTerms: invoice?.customer_terms || '',
    internalNotes: invoice?.internal_notes || '',
    dueAt: invoice?.due_at ? toDateTimeLocalValue(invoice.due_at) : toDateTimeLocalValue(),
    amendmentReason: invoice?.amendment_reason || '',
  }
}

function createInitialThirdPartyShareForm(): ThirdPartyShareFormState {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  return {
    label: 'Third-party document access',
    recipientName: '',
    purpose: '',
    expiresAt: toDateTimeLocalValue(expiresAt),
    allowedCategories: [...THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES],
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatReservationStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function mapInvoiceToPackageInvoiceStatus(invoice: TravelPackageInvoice) {
  if (invoice.status === 'void') return 'void'
  if (invoice.released_to_customer || invoice.status === 'released') return 'released_to_customer'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.status === 'amended') return 'amended'
  if (invoice.status === 'internal_review') return 'internal_review'
  if (invoice.status === 'closed') return 'closed'
  return 'finalised'
}

function formatFileSize(bytes: number) {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPaymentMethod(method: string | null | undefined) {
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Credit Card'
  return 'Bank transfer'
}

function parseMoneyInput(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSelectedCombination(
  combination: PackageCombination | null | undefined,
): PackageCombination | null {
  if (!combination) return null

  return {
    ...combination,
    staySelections: Array.isArray(combination.staySelections)
      ? combination.staySelections.filter((stay) => stay?.option)
      : [],
    visaOptions: Array.isArray(combination.visaOptions)
      ? combination.visaOptions.filter(Boolean)
      : [],
    appliedOffers: Array.isArray(combination.appliedOffers)
      ? combination.appliedOffers.filter(Boolean)
      : [],
    flightOption: combination.flightOption || null,
    visaOption: combination.visaOption || null,
    transportOption: combination.transportOption || null,
    packageSubtotalPrice: Number(combination.packageSubtotalPrice || 0),
    paymentSurchargeTotal: Number(combination.paymentSurchargeTotal || 0),
    totalPrice: Number(combination.totalPrice || 0),
    grossPrice: Number(combination.grossPrice || combination.totalPrice || 0),
    offerDiscountTotal: Number(combination.offerDiscountTotal || 0),
    perPersonPrice: Number(combination.perPersonPrice || 0),
    payingGuests: Number(combination.payingGuests || 0),
    servicePassengers: Number(combination.servicePassengers || 0),
    currency: combination.currency || 'GBP',
    paymentMethod: combination.paymentMethod || 'bank_transfer',
  }
}

export type VisaPassengerCounts = Pick<
  PackageQuotePayload,
  'adults' | 'childrenPaying' | 'childrenFree' | 'infants'
> & {
  servicePassengers: number
}

function getVisaPassengerCategoryCount(
  option: { visaPassengerCategory?: PackageVisaPassengerCategory },
  counts: VisaPassengerCounts,
) {
  if (option.visaPassengerCategory === 'adult') return counts.adults
  if (option.visaPassengerCategory === 'child_5_plus') return counts.childrenPaying
  if (option.visaPassengerCategory === 'child_2_to_4') return counts.childrenFree
  if (option.visaPassengerCategory === 'infant') return counts.infants
  return counts.servicePassengers
}

function getVisaQuantity(
  option: { quantity?: number; visaPassengerCategory?: PackageVisaPassengerCategory },
  counts: VisaPassengerCounts,
) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : getVisaPassengerCategoryCount(option, counts)
}

function getVisaPassengerCategoryLabel(category: PackageVisaPassengerCategory | undefined) {
  if (category === 'adult') return 'Adult'
  if (category === 'child_5_plus') return 'Child 5+'
  if (category === 'child_2_to_4') return 'Child 2-4'
  if (category === 'infant') return 'Infant'
  return 'Traveller'
}

function getOptionSoldTotal(
  option: PackageComponentOption | null | undefined,
  servicePassengers: number,
  passengers?: TravelPackageFolder['passenger_summary'],
) {
  if (!option) return 0
  if (option.adultPrice || option.childPrice || option.infantPrice) {
    return (
      Number(option.adultPrice || 0) * Number(passengers?.adults || 0) +
      Number(option.childPrice || 0) *
        (Number(passengers?.childrenPaying || 0) + Number(passengers?.childrenFree || 0)) +
      Number(option.infantPrice || 0) * Number(passengers?.infants || 0)
    )
  }
  if (option.pricingMode === 'per_person') return Number(option.price || 0) * servicePassengers
  return Number(option.price || 0)
}

function getVisaOptionSoldTotal(option: PackageComponentOption, counts: VisaPassengerCounts) {
  if (option.pricingMode === 'total') return Number(option.price || 0)
  return Number(option.price || 0) * getVisaQuantity(option, counts)
}

function getStaySelectionSoldTotal(stay: PackageCombination['staySelections'][number]) {
  const addonTotal = (stay.addonOptions || []).reduce(
    (total, addon) => total + Number(addon.adjustedPrice ?? addon.price ?? 0),
    0,
  )
  return Number(stay.option.price || 0) + addonTotal
}

function getReservationSummary(option: PackageComponentOption | null | undefined) {
  return (
    option?.summary?.trim() ||
    'Pulled from the final quote. Agent to complete supplier references, booked cost, and confirmation status.'
  )
}

function getTransportReservationSummary(option: PackageComponentOption | null | undefined) {
  if (!option?.transportRoutes?.length) return getReservationSummary(option)
  const routeLines = option.transportRoutes.map((route) => {
    const supplier = route.supplierName ? ` - ${route.supplierName}` : ''
    const vehicle = route.vehicleLabel ? ` (${route.vehicleLabel})` : ''
    const gbpCost =
      route.costPriceGbp && route.costPriceGbp > 0 ? ` - GBP ${route.costPriceGbp.toFixed(2)}` : ''
    const sourceCost =
      route.currency !== 'GBP' && route.costPrice > 0
        ? ` (${route.currency} ${route.costPrice.toFixed(2)} at ${Number(route.exchangeRate || 0).toFixed(4)} SAR/GBP)`
        : ''
    return `* ${route.routeName}${supplier}${vehicle}${gbpCost}${sourceCost}`
  })
  const netCost =
    option.transportNetCost && option.transportNetCost > 0
      ? `Net transport cost: ${option.transportNetCurrency || 'GBP'} ${option.transportNetCost.toFixed(2)}`
      : ''
  return [option.summary?.trim(), ...routeLines, netCost].filter(Boolean).join('\n')
}

function createReservationFinancialForm(
  reservation: TravelPackageReservation,
): ReservationFinancialFormState {
  return {
    bookedCostTotal: String(reservation.booked_cost_total || ''),
    soldPriceTotal: String(reservation.sold_price_total || ''),
    discountTotal: String(reservation.discount_total || ''),
    commissionExpectedTotal: String(reservation.commission_expected_total || ''),
    depositRequired: reservation.deposit_required,
    depositAmount: String(reservation.deposit_amount || ''),
    paymentDueAt: reservation.payment_due_at
      ? toDateTimeLocalValue(reservation.payment_due_at)
      : '',
  }
}

function createReservationDetailForm(
  reservation: TravelPackageReservation,
): ReservationDetailFormState {
  return {
    reservationType: reservation.reservation_type,
    title: reservation.title,
    status: reservation.status,
    supplierName: reservation.supplier_name || '',
    supplierReference: reservation.supplier_reference || '',
    bookingReference: reservation.booking_reference || '',
    internalNotes: reservation.internal_notes || '',
  }
}

export {
  CUSTOMER_PORTAL_URL,
  VISA_PHOTO_DOCUMENT_KIND,
  createInitialInvoiceForm,
  createInitialReservationForm,
  createInitialReservationItemForm,
  createInitialReservationRefundForm,
  createInitialThirdPartyShareForm,
  createReservationDetailForm,
  createReservationFinancialForm,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatPaymentMethod,
  formatReservationStatus,
  getLinkedVisaPhotoParentId,
  getOptionSoldTotal,
  getReservationSummary,
  getStaySelectionSoldTotal,
  getTransportReservationSummary,
  getVisaPassengerCategoryLabel,
  getVisaQuantity,
  getVisaOptionSoldTotal,
  invoiceStatusOptions,
  isVisaPhotoDocument,
  mapInvoiceToPackageInvoiceStatus,
  normalizeSelectedCombination,
  parseMoneyInput,
  reservationItemStatusOptions,
  reservationItemTypeOptions,
  reservationStatusOptions,
  reservationTypeOptions,
  toDateTimeLocalValue,
}
