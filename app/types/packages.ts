/**
 * Travel package quote types.
 *
 * The package creator starts from the old hotel combiner idea, but stores a
 * richer quote payload that can mix stays, flights, and transport.
 */

export type TravelPackageType = 'umrah' | 'ziyarat' | 'holiday'
export type TravelPackageStatus =
  | 'draft'
  | 'shared'
  | 'expired'
  | 'customer_selected'
  | 'agent_selected'
  | 'finalised'
  | 'converted'
  | 'archived'
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
export type PackagePaymentMethod = 'cash' | 'bank_transfer' | 'card'
export type PackagePaymentIntent = 'full_payment' | 'deposit_only' | 'installment_request'
export type TravelPackageDocumentCategory =
  | 'flight'
  | 'hotel'
  | 'transport'
  | 'visa'
  | 'e_sim'
  | 'insurance'
  | 'invoice'
  | 'other'
export type TravelPackageDocumentStatus =
  | 'draft'
  | 'ready_for_review'
  | 'released'
  | 'revoked'
  | 'deleted'
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
export type TravelPackageInvoiceStatus =
  | 'draft'
  | 'internal_review'
  | 'finalised'
  | 'pending_payment'
  | 'part_paid'
  | 'paid'
  | 'released'
  | 'amended'
  | 'void'
  | 'closed'
export type TravelPackageInvoiceLineType =
  | 'flight'
  | 'hotel'
  | 'visa'
  | 'transport'
  | 'discount'
  | 'commission'
  | 'other'
export type TravelPackagePassengerType = 'adult' | 'child' | 'infant'
export type TravelPackagePaymentType =
  | 'deposit'
  | 'payment'
  | 'refund'
  | 'chargeback'
  | 'commission'
export type TravelPackagePaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other'
export type TravelPackagePaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
export type TravelPackageTaskStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
export type TravelPackagePriority = 'low' | 'medium' | 'high' | 'critical'
export type TravelPackageDeadlineStatus = 'open' | 'met' | 'missed' | 'cancelled' | 'extended'
export type TravelPackageRiskStatus = 'open' | 'acknowledged' | 'resolved'
export type TravelPackageCommunicationChannel =
  | 'whatsapp'
  | 'phone'
  | 'in_person'
  | 'email'
  | 'internal'
export type TravelPackageCommunicationDirection = 'inbound' | 'outbound' | 'internal'
export type TravelPackageVoucherStatus =
  | 'draft'
  | 'generated'
  | 'released_to_customer'
  | 'amended'
  | 'revoked'

export interface PackageComponentOption {
  id: string
  title: string
  summary: string
  price: number
  pricingMode?: PackagePricingMode
  isDefault?: boolean
  adultPrice?: number
  childPrice?: number
  infantPrice?: number
  quantity?: number
  includesZiyarat?: boolean
  includesTourGuide?: boolean
  transportRoutes?: PackageTransportRouteSelection[]
  transportMainSupplierId?: string
  transportMainSupplierName?: string
  transportNetCost?: number
  transportNetCurrency?: string
}

export type PackageTransportRouteKind = 'transfer' | 'makkah_ziyarat' | 'madinah_ziyarat'

export interface PackageTransportRouteSelection {
  id: string
  kind: PackageTransportRouteKind
  routeId: string
  routeName: string
  supplierId: string
  supplierName: string
  vehicleTypeId: string
  vehicleLabel: string
  costPrice: number
  currency: string
  baseCostPriceGbp?: number
  costPriceGbp?: number
  exchangeRate?: number
  exchangeRateMode?: 'sar_per_gbp'
  damageRecoveryMarginMode?: 'percent' | 'fixed'
  damageRecoveryMarginValue?: number
  damageRecoveryMarginAmountGbp?: number
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

export interface PackageLinkedFlightOption {
  id: string
  airlineName: string
  summary: string
  adultDelta: number
  childDelta: number
  infantDelta: number
  isDefault?: boolean
}

export interface PackageLinkedFlightGroup {
  id: string
  baseFlightOptionId?: string | null
  routeLabel: string
  defaultOptionId?: string | null
  options: PackageLinkedFlightOption[]
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
  infants: number
  itineraryOrder: string[]
  departureDate: string
  returnDate: string
  stayGroups: PackageStayGroup[]
  flightOptions: PackageComponentOption[]
  linkedFlightGroups: PackageLinkedFlightGroup[]
  visaOptions: PackageComponentOption[]
  transportOptions: PackageComponentOption[]
  limitedTimeOffers: PackageLimitedTimeOffer[]
  cardProcessingFeePercent: number
  depositRequired?: boolean
  depositAmount?: number
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
  linkedFlightSelections: Array<{
    group: PackageLinkedFlightGroup
    option: PackageLinkedFlightOption
  }>
  visaOption: PackageComponentOption | null
  visaOptions: PackageComponentOption[]
  transportOption: PackageComponentOption | null
  packageSubtotalPrice: number
  paymentMethod: PackagePaymentMethod
  paymentBreakdown?: PackagePaymentBreakdown | null
  paymentSurchargeTotal: number
  totalPrice: number
  grossPrice: number
  offerDiscountTotal: number
  perPersonPrice: number
  payingGuests: number
  servicePassengers: number
  currency: string
  appliedOffers: PackageLimitedTimeOffer[]
}

export interface PackagePassengerPriceBreakdown {
  adult: number
  child: number
  childTwoToFour: number
  infant: number
  adultTotal: number
  childTotal: number
  childTwoToFourTotal: number
  infantTotal: number
  total: number
  currency: string
}

export interface PackagePaymentBreakdown {
  cash: number
  bankTransfer: number
  card: number
}

export interface PackageSelectionInput {
  stayOptionIds: Record<string, string>
  flightOptionId?: string | null
  linkedFlightOptionIds?: Record<string, string>
  visaOptionId?: string | null
  transportOptionId?: string | null
  paymentMethod?: PackagePaymentMethod | null
  paymentBreakdown?: Partial<PackagePaymentBreakdown> | null
  paymentIntent?: PackagePaymentIntent | null
  installmentRequested?: boolean
  depositPaymentMethod?: PackagePaymentMethod | null
  termsAccepted?: boolean
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
  finalised_at?: string | null
  finalised_by?: string | null
  finalised_source?: 'customer' | 'agent' | null
  customer_selection_note?: string | null
  agent_selection_note?: string | null
  last_shared_by?: string | null
  archived_at?: string | null
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
    infants?: number
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
  document_access_token?: string | null
  document_access_enabled?: boolean | null
  document_access_expires_at?: string | null
  document_access_last_viewed_at?: string | null
  customer_access_last_name?: string | null
  portal_access_created_at?: string | null
  travelled_at?: string | null
  returned_at?: string | null
  earned_at?: string | null
  cancellation_reason?: string | null
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string | null
  archived_at: string | null
  closed_at: string | null
}

export interface TravelPackageDocument {
  id: string
  package_id: string
  reservation_id: string | null
  quote_id: string | null
  invoice_id?: string | null
  uploaded_by: string | null
  updated_by: string | null
  category: TravelPackageDocumentCategory
  title: string
  file_name: string
  file_size: number
  file_type: string
  storage_provider: 'minio' | 'r3_backup' | 'external'
  storage_bucket: string
  storage_key: string
  storage_etag: string
  backup_provider?: string | null
  backup_bucket?: string | null
  backup_key?: string | null
  backup_status?: 'pending' | 'copied' | 'failed' | 'skipped'
  backup_error?: string | null
  status: TravelPackageDocumentStatus
  customer_visible: boolean
  released_at: string | null
  released_by: string | null
  revoked_at: string | null
  revoked_by: string | null
  public_notes: string | null
  internal_notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
  deleted_at: string | null
  signed_url?: string
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

export interface TravelPackageInvoiceLine {
  id: string
  invoice_id: string
  package_id: string
  reservation_id: string | null
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
  created_at: string
  updated_at: string | null
}

export interface TravelPackageInvoice {
  id: string
  package_id: string
  quote_id: string | null
  created_by: string | null
  updated_by: string | null
  released_by: string | null
  invoice_number: string
  status: TravelPackageInvoiceStatus
  currency: string
  subtotal_sold: number
  discount_total: number
  total_sold: number
  total_paid: number
  balance_due: number
  total_booked_cost: number
  projected_margin: number
  expected_commission_total: number
  received_commission_total: number
  released_to_customer: boolean
  released_at: string | null
  version: number
  customer_terms: string | null
  internal_notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
  voided_at: string | null
  due_at?: string | null
  finalised_at?: string | null
  amendment_reason?: string | null
  released_version?: number | null
  lines?: TravelPackageInvoiceLine[]
}

export interface TravelPackagePassenger {
  id: string
  package_id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  passenger_type: TravelPackagePassengerType
  passport_received: boolean
  passport_checked: boolean
  passport_issue_note: string | null
  visa_status:
    | 'not_started'
    | 'details_required'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'not_required'
  ticket_status: 'not_started' | 'held' | 'ticketed' | 'changed' | 'cancelled'
  room_allocation: string | null
  internal_notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string | null
}

export interface TravelPackagePayment {
  id: string
  package_id: string
  invoice_id: string | null
  amount: number
  currency: string
  payment_type: TravelPackagePaymentType
  payment_method: TravelPackagePaymentMethod
  payment_status: TravelPackagePaymentStatus
  requested_at: string | null
  due_at: string | null
  received_at: string | null
  received_by: string | null
  receipt_reference: string | null
  receipt_document_id: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string | null
}

export interface TravelPackageInstallment {
  id: string
  plan_id: string
  package_id: string
  payment_id: string | null
  sequence_number: number
  amount: number
  due_on: string
  status: 'scheduled' | 'due' | 'paid' | 'overdue' | 'waived' | 'cancelled'
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface TravelPackagePaymentPlan {
  id: string
  package_id: string
  invoice_id: string | null
  lms_plan_id: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'defaulted'
  currency: string
  total_amount: number
  deposit_amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'custom'
  starts_on: string | null
  internal_notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string | null
  installments?: TravelPackageInstallment[]
}

export interface TravelPackageTask {
  id: string
  package_id: string | null
  quote_id: string | null
  reservation_id?: string | null
  invoice_id?: string | null
  title: string
  description: string | null
  task_type: string
  status: TravelPackageTaskStatus
  priority: TravelPackagePriority
  assigned_to: string | null
  due_at: string | null
  completed_at: string | null
  completed_by: string | null
  auto_generated: boolean
  source_rule: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export interface TravelPackageDeadline {
  id: string
  package_id: string | null
  quote_id: string | null
  reservation_id?: string | null
  invoice_id?: string | null
  deadline_type: string
  title: string
  due_at: string
  status: TravelPackageDeadlineStatus
  severity: TravelPackagePriority
  assigned_to: string | null
  reminder_sent_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export interface TravelPackageRiskFlag {
  id: string
  package_id: string | null
  quote_id: string | null
  risk_type: string
  severity: TravelPackagePriority
  status: TravelPackageRiskStatus
  source: 'automatic' | 'manual'
  title: string
  description: string | null
  assigned_to: string | null
  due_at: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string | null
}

export interface TravelPackageCommunication {
  id: string
  package_id: string | null
  quote_id: string | null
  reservation_id?: string | null
  invoice_id?: string | null
  channel: TravelPackageCommunicationChannel
  direction: TravelPackageCommunicationDirection
  summary: string
  follow_up_required: boolean
  follow_up_due_at: string | null
  created_by: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface TravelPackageAuditEvent {
  id: string
  package_id: string | null
  quote_id: string | null
  actor_id: string | null
  event_type: string
  event_summary: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface TravelPackageTransportVoucherData {
  bookingId?: string
  adults?: number
  children?: number
  infants?: number
  passengers?: string
  flightNumber?: string
  airports?: string
  landingDate?: string
  landingTime?: string
  vehicle?: string
  maxBags?: string
  extraBaggageFee?: string
  providerName?: string
  providerContact?: string
  itinerary?: Array<{
    type: string
    description: string
    date: string
    time: string
  }>
  routeAssignments?: Array<{
    routeName: string
    type: string
    supplierName?: string
    vehicleType?: string
    date?: string
    time?: string
  }>
  sourceTransportOptionId?: string
  sourceTransportOptionTitle?: string
  digitalVoucherUrl?: string
  qrCodeDataUrl?: string
  quoteSnapshot?: {
    title?: string
    packageType?: string
    departureDate?: string
    returnDate?: string
    adults?: number
    children?: number
    infants?: number
    flightTitle?: string
    makkahHotel?: string
    madinahHotel?: string
    transportOptionId?: string
    transportOptionTitle?: string
    transportProvider?: string
    routes?: string[]
  }
  arrivalAirport: string
  arrivalAt: string
  departureAirport: string
  departureAt: string
  makkahHotel: string
  madinahHotel: string
  routes: string[]
  vehicleType: string
  transportCompany: string
  driverContact: string
  groundManager: string
  publicNotes: string
  internalNotes: string
}

export interface TravelPackageTransportVoucher {
  id: string
  package_id: string
  reservation_id: string | null
  document_id: string | null
  version: number
  status: TravelPackageVoucherStatus
  customer_visible: boolean
  voucher_data: TravelPackageTransportVoucherData
  rendered_html: string | null
  generated_at: string | null
  released_at: string | null
  released_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string | null
}
