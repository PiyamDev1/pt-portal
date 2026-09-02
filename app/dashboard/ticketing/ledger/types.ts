import type {
  TicketingAppendServiceTransactionInput,
  TicketingMarkServiceTransactionPaidInput,
} from '@/lib/ticketing/serviceTransactionContracts'
import type {
  TicketingAttributionEmployee,
  TicketingCorrectAttributionInput,
} from '@/lib/ticketing/attributionContracts'

export type TicketPassengerType = 'ADT' | 'YTH' | 'CHD' | 'INF'

export type TicketDetailsStatus = 'needs_details' | 'complete' | 'recorded'

export type TicketAirlineOption = {
  id: string
  iataCode: string
  name: string
}

export type TicketSupplierCode = 'sabre_polani' | 'amadeus_piyam' | 'sabre_bt' | 'ptap' | 'airline'

export type TicketSupplier = {
  code: TicketSupplierCode | 'unknown'
  name: string
}

export type TicketCommercialTreatment = 'standard' | 'staff_family' | 'commission_waived'

export type TicketAttributionEmployee = TicketingAttributionEmployee

export type TicketLedgerFare = {
  passengerType: TicketPassengerType
  quantity: number
  unitSupplierCost: string | number | null
  unitSalePrice: string | number | null
  unitGrossSalePrice?: string | number | null
  unitDiscount?: string | number | null
}

export type TicketLedgerItem = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  pnr: string
  customerName: string
  airline: TicketAirlineOption
  supplier?: TicketSupplier
  serviceType: 'TK' | 'DC' | 'R-ER'
  operationalStatus: string
  paymentStatus: string
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  passengerCount: number
  packageMatchStatus: string
  commissionScope?: string
  commercialTreatment: TicketCommercialTreatment
  commissionWaiverReason: string | null
  staffFamilyChangeFeeGbp: number
  staffFamilyRefundFeeGbp: number
  detailsStatus?: TicketDetailsStatus
  fares: TicketLedgerFare[]
  responsibleEmployee: TicketAttributionEmployee
  assistantEmployees: TicketAttributionEmployee[]
  attributionVersion: number
}

export type TicketLedgerContext = {
  employeeId: string
  employeeName: string
  locationName: string | null
  timezone: string
  canManageAttribution: boolean
  canManageRecords: boolean
  canArchiveRecords: boolean
  attributionEmployees: TicketAttributionEmployee[]
  staffFamilyChangeFeeGbp: number
  staffFamilyRefundFeeGbp: number
}

export type TicketLedgerPayload = {
  items: TicketLedgerItem[]
  airlines: TicketAirlineOption[]
  context: TicketLedgerContext
  nextCursor: string | null
}

export type TicketFareInput = {
  passengerType: TicketPassengerType
  quantity: number
  unitSupplierCost: number
  unitSalePrice: number | null
  unitDiscount: number | null
}

export type CreateTkTicketInput = {
  customerName: string
  pnr: string
  airlineId: string
  supplierCode: TicketSupplierCode
  serviceType: 'TK'
  operationalStatus: 'held' | 'issued'
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  currency: 'GBP'
  fares: TicketFareInput[]
  commercialTreatment: TicketCommercialTreatment
  commissionWaiverReason: string | null
  responsibleEmployeeId?: string
  assistantEmployeeIds?: string[]
  attributionReason?: string | null
  confirmDuplicate?: boolean
}

export type CorrectTicketAttributionInput = TicketingCorrectAttributionInput

export type TicketServiceBookingOption = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  rootBookingDate: string
  pnr: string
  customerName: string
  contactPhone: string | null
  departureDate: string | null
  returnDate: string | null
  operationalStatus: 'issued'
  airline: TicketAirlineOption
  packageMatchStatus: string
  commercialTreatment: TicketCommercialTreatment
  commissionWaiverReason: string | null
  staffFamilyChangeFeeGbp: number
  fares: Array<{
    passengerType: TicketPassengerType
    quantity: number
  }>
  passengers: Array<{
    id: string
    passengerType: TicketPassengerType
    position: number
    fullName: string | null
  }>
}

export type TicketServiceBookingLookupResult = {
  items: TicketServiceBookingOption[]
  hasMore: boolean
  nextCursor: string | null
}

export type CreateTicketServiceInput = TicketingAppendServiceTransactionInput
export type MarkTicketServicePaidInput = TicketingMarkServiceTransactionPaidInput

export type DuplicateTkRecord = {
  bookingId: string
  pnr: string
  customerName: string
}

export type TicketCompletionFare = {
  id: string
  passengerType: TicketPassengerType
  quantity: number
  unitSupplierCost: string | number | null
  unitSalePrice: string | number | null
  salePriceLocked: boolean
}

export type TicketCompletionPassenger = {
  passengerType: TicketPassengerType
  position: number
  fullName: string | null
  contactPhone: string | null
  dateOfBirth: string | null
  ticketNumber: string | null
}

export type TicketCompletionDetail = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  pnr: string
  customerName: string
  contactPhone: string | null
  departureDate: string | null
  returnDate: string | null
  operationalStatus: string
  paymentStatus: 'unpaid' | 'part_paid' | 'paid'
  paidAt: string | null
  airline: TicketAirlineOption
  responsibleEmployee: TicketAttributionEmployee
  detailsStatus: TicketDetailsStatus
  fares: TicketCompletionFare[]
  passengers: TicketCompletionPassenger[]
}

export type TicketCompletionContext = {
  ownerEmployee: TicketAttributionEmployee
  isOnBehalf: boolean
  onBehalfReasonRequired: boolean
  canManageRecords: boolean
}

export type TicketChangeRequestType = 'amendment' | 'deletion'

export type TicketChangeRequest = {
  id: string
  bookingId: string
  pnr: string
  customerName: string
  requestType: TicketChangeRequestType
  requestNotes: string | null
  createdAt: string
  requestedBy: TicketAttributionEmployee
}

export type TicketCompletionLoadResult = {
  detail: TicketCompletionDetail
  completionContext: TicketCompletionContext
}

export type TicketCompletionUpdate = {
  expectedBookingVersion: number
  expectedTransactionVersion: number
  contactPhone: string | null
  departureDate: string | null
  returnDate: string | null
  paymentStatus: 'unpaid' | 'paid'
  paidAt: string | null
  onBehalfReason: string | null
  fareSales: Array<{
    passengerType: TicketPassengerType
    unitSalePrice: number | null
  }>
  passengers: TicketCompletionPassenger[]
}
