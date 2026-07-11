/**
 * Travel package quote types.
 *
 * The package creator starts from the old hotel combiner idea, but stores a
 * richer quote payload that can mix stays, flights, and transport.
 */

export type TravelPackageType = 'umrah' | 'ziyarat' | 'holiday'
export type TravelPackageStatus = 'draft' | 'shared' | 'archived'
export type TravelPackageFolderStatus =
  | 'selected'
  | 'awaiting_passports'
  | 'awaiting_deposit'
  | 'reservation_pending'
  | 'partially_booked'
  | 'fully_reserved'
  | 'documents_pending'
  | 'documents_released'
  | 'travelling_soon'
  | 'travelling'
  | 'returned'
  | 'closed'
  | 'cancelled'
  | 'archived'
export type PackagePricingMode = 'total' | 'per_person'
export type PackageDiscountMode = 'total' | 'per_person'
export type TravelPackageReservationType = 'flight' | 'hotel' | 'visa' | 'transport' | 'other'
export type TravelPackageReservationStatus =
  | 'not_started'
  | 'quote_requested'
  | 'availability_checked'
  | 'reservation_pending'
  | 'reserved'
  | 'deposit_required'
  | 'paid'
  | 'confirmed'
  | 'changed'
  | 'cancelled'
  | 'failed'
export type TravelPackageReservationItemStatus =
  | 'draft'
  | 'reserved'
  | 'confirmed'
  | 'changed'
  | 'cancelled'
export type TravelPackageReservationItemType =
  | TravelPackageReservationType
  | 'commission'
  | 'discount'

export interface PackageComponentOption {
  id: string
  title: string
  summary: string
  price: number
  pricingMode?: PackagePricingMode
}

export interface PackageStayGroup {
  id: string
  label: string
  options: PackageComponentOption[]
}

export interface PackageLimitedTimeOffer {
  id: string
  title: string
  summary: string
  expiresAt: string
  discountAmount: number
  discountMode: PackageDiscountMode
  active: boolean
}

export interface PackageQuotePayload {
  title: string
  packageType: TravelPackageType
  currency: string
  customerName: string
  customerPhone: string
  customerEmail: string
  adults: number
  childrenPaying: number
  childrenFree: number
  itineraryOrder: string[]
  departureDate: string
  returnDate: string
  stayGroups: PackageStayGroup[]
  flightOptions: PackageComponentOption[]
  visaOptions: PackageComponentOption[]
  transportOptions: PackageComponentOption[]
  limitedTimeOffers: PackageLimitedTimeOffer[]
  notes: string
}

export interface PackageCombination {
  id: string
  staySelections: Array<{
    groupId: string
    groupLabel: string
    option: PackageComponentOption
  }>
  flightOption: PackageComponentOption | null
  visaOption: PackageComponentOption | null
  transportOption: PackageComponentOption | null
  totalPrice: number
  grossPrice: number
  offerDiscountTotal: number
  perPersonPrice: number
  payingGuests: number
  servicePassengers: number
  currency: string
  appliedOffers: PackageLimitedTimeOffer[]
}

export interface PackageSelectionInput {
  stayOptionIds: Record<string, string>
  flightOptionId?: string | null
  visaOptionId?: string | null
  transportOptionId?: string | null
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  note?: string
}

export interface PackageResolvedSelection {
  selection: PackageSelectionInput
  combination: PackageCombination
}

export interface TravelPackageQuote {
  id: string
  title: string
  package_type: TravelPackageType
  status: TravelPackageStatus
  currency: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  payload: PackageQuotePayload
  share_token: string
  share_enabled: boolean
  shared_at: string | null
  expires_at: string
  selected_option: PackageResolvedSelection | null
  selected_at: string | null
  selection_note: string | null
  converted_package_id?: string | null
  converted_at?: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface TravelPackageFolder {
  id: string
  package_reference: string
  source_quote_id: string | null
  created_by: string | null
  assigned_agent_id: string | null
  location_id: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  package_type: TravelPackageType
  destination: string | null
  departure_date: string | null
  return_date: string | null
  status: TravelPackageFolderStatus
  passenger_summary: {
    adults?: number
    childrenPaying?: number
    childrenFree?: number
    totalPassengers?: number
    hotelPayingGuests?: number
    servicePassengers?: number
  }
  selected_quote_snapshot: {
    quote?: TravelPackageQuote
    selection?: PackageResolvedSelection
    payload?: PackageQuotePayload
  }
  current_public_summary: Record<string, unknown>
  passport_status: string
  payment_status: string
  invoice_status: string
  document_release_status: string
  next_action: string | null
  next_action_due_at: string | null
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical'
  minio_bucket: string | null
  minio_prefix: string | null
  created_at: string
  updated_at: string | null
  archived_at: string | null
  closed_at: string | null
}

export interface TravelPackageReservationItem {
  id: string
  reservation_id: string
  package_id: string
  item_type: TravelPackageReservationItemType
  title: string
  description: string | null
  quantity: number
  unit_booked_cost: number
  unit_sold_price: number
  discount_amount: number
  commission_expected_amount: number
  commission_received_amount: number
  total_booked_cost: number
  total_sold_price: number
  currency: string
  supplier_reference: string | null
  status: TravelPackageReservationItemStatus
  starts_at: string | null
  ends_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export interface TravelPackageReservation {
  id: string
  package_id: string
  quote_id: string | null
  created_by: string | null
  updated_by: string | null
  reservation_type: TravelPackageReservationType
  title: string
  status: TravelPackageReservationStatus
  supplier_name: string | null
  supplier_reference: string | null
  booking_reference: string | null
  currency: string
  booked_cost_total: number
  sold_price_total: number
  discount_total: number
  commission_expected_total: number
  commission_received_total: number
  deposit_required: boolean
  deposit_amount: number
  deposit_due_at: string | null
  payment_due_at: string | null
  reserved_at: string | null
  confirmed_at: string | null
  cancelled_at: string | null
  customer_visible: boolean
  public_notes: string | null
  internal_notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
  items?: TravelPackageReservationItem[]
}
