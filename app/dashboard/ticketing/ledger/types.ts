export type TicketPassengerType = 'ADT' | 'CHD' | 'INF'

export type TicketDetailsStatus = 'needs_details' | 'complete'

export type TicketAirlineOption = {
  id: string
  iataCode: string
  name: string
}

export type TicketLedgerFare = {
  passengerType: TicketPassengerType
  quantity: number
  unitSupplierCost: string | number | null
  unitSalePrice: string | number | null
}

export type TicketLedgerItem = {
  bookingId: string
  transactionId: string
  pnr: string
  customerName: string
  airline: TicketAirlineOption
  serviceType: 'TK' | 'DC' | 'R-ER'
  operationalStatus: string
  paymentStatus: string
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  passengerCount: number
  packageMatchStatus: string
  commissionScope?: string
  detailsStatus?: TicketDetailsStatus
  fares: TicketLedgerFare[]
}

export type TicketLedgerContext = {
  employeeName: string
  locationName: string | null
  timezone: string
}

export type TicketLedgerPayload = {
  items: TicketLedgerItem[]
  airlines: TicketAirlineOption[]
  context: TicketLedgerContext
}

export type TicketFareInput = {
  passengerType: TicketPassengerType
  quantity: number
  unitSupplierCost: number
}

export type CreateTkTicketInput = {
  customerName: string
  pnr: string
  airlineId: string
  serviceType: 'TK'
  operationalStatus: 'held' | 'issued'
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  currency: 'GBP'
  fares: TicketFareInput[]
  confirmDuplicate?: boolean
}

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
  detailsStatus: TicketDetailsStatus
  fares: TicketCompletionFare[]
  passengers: TicketCompletionPassenger[]
}

export type TicketCompletionUpdate = {
  expectedBookingVersion: number
  expectedTransactionVersion: number
  contactPhone: string | null
  departureDate: string | null
  returnDate: string | null
  paymentStatus: 'unpaid' | 'paid'
  paidAt: string | null
  fareSales: Array<{
    passengerType: TicketPassengerType
    unitSalePrice: number | null
  }>
  passengers: TicketCompletionPassenger[]
}
