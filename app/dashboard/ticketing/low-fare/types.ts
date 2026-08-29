export type LowFareMoney = number | string

export type LowFareAirline = {
  id: string
  iataCode: string
  name: string
}

export type LowFareOwner = {
  employeeId: string
  fullName: string
}

export type LowFareLatestAdjustment = {
  adjustmentId: string
  previousAdjustmentId: string | null
  sequenceNumber: number
  originalSupplierFareGbp: LowFareMoney
  newSupplierFareGbp: LowFareMoney
  differenceGbp: LowFareMoney
  effectiveDate: string
  actingEmployeeId: string
  createdAt: string
}

export type LowFareLatestCheck = {
  checkId: string
  currentAdjustmentId: string | null
  observedFareGbp: LowFareMoney
  effectiveDate: string
  checkedByEmployeeId: string
  createdAt: string
}

export type LowFareQueueItem = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  pnr: string
  airline: LowFareAirline
  departureDate: string | null
  returnDate: string | null
  passengerCount: number
  owner: LowFareOwner
  issuedDate: string
  initialSupplierFareGbp: LowFareMoney
  currentSupplierFareGbp: LowFareMoney
  latestAdjustment: LowFareLatestAdjustment | null
  latestCheck: LowFareLatestCheck | null
  packageMatchStatus: string
  updatedAt: string
}

export type LowFareQueueFilters = {
  pnr: string
  airline: string
  owner: string
  departureFrom: string
  departureTo: string
}

export type LowFareQueuePage = {
  items: LowFareQueueItem[]
  filterOptions: { owners: LowFareOwner[] }
  hasMore: boolean
  nextCursor: string | null
}

export type LowFareCheckInput = {
  bookingId: string
  expectedBookingVersion: number
  expectedRootTransactionVersion: number
  expectedPreviousAdjustmentId: string | null
  effectiveDate: string
  notes: string | null
}

export type LowFareCheckResult = {
  checkId: string
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  observedFareGbp: LowFareMoney
  effectiveDate: string
  packageMatchStatus: string
  createdAt: string
  idempotentReplay: boolean
}

export type LowFareSaveResult = LowFareAdjustmentResult | LowFareCheckResult

export type LowFareAdjustmentInput = {
  bookingId: string
  expectedBookingVersion: number
  expectedRootTransactionVersion: number
  expectedPreviousAdjustmentId: string | null
  newSupplierFareGbp: number
  effectiveDate: string
  notes: string | null
  currency: 'GBP'
}

export type LowFareAdjustmentResult = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  adjustmentId: string
  previousAdjustmentId: string | null
  sequenceNumber: number
  currency: 'GBP'
  originalSupplierFareGbp: LowFareMoney
  newSupplierFareGbp: LowFareMoney
  differenceGbp: LowFareMoney
  passengerCount: number
  effectiveDate: string
  packageMatchStatus: string
  createdAt: string
  idempotentReplay: boolean
}
