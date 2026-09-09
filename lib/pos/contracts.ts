export type PosLedgerPeriod = 'day' | 'month'
export type PosDirection = 'IN' | 'OUT'
export type PosPaymentMethod = 'CASH' | 'CARD' | 'BANK' | 'OTHER'
export type PosLedgerPaymentMethod = 'Cash' | 'Card' | 'Bank' | 'Split' | 'Other'
export type PosReconciliationStatus = 'RECORDED' | 'PENDING' | 'COMPLETED' | 'FAILED'
export type PosOutgoingType = 'REFUND' | 'EXPENSE' | 'SUPPLIER_PAYMENT'

export type PosLedgerTender = {
  id?: string
  method: Exclude<PosLedgerPaymentMethod, 'Split'>
  methodCode?: PosPaymentMethod
  amount: number
  direction: PosDirection
  reconciliationStatus: PosReconciliationStatus | 'CLEARED' | 'OWED_TO_US' | 'UNPAID_DEBT_IN'
  externalReference?: string | null
  cashImpact?: number
}

export type PosSourceLink = {
  id: string
  sourceType: 'LMS' | 'TICKETING' | 'APPLICATIONS' | 'PACKAGES' | 'POS' | 'LEGACY'
  namespace: string | null
  recordId: string
  displayReference: string | null
}

export type PosRefundSummary = {
  id: string
  reference: string
  amount: number
  status: PosReconciliationStatus
  reasonCode: string
  createdAt: string
  pointsReversed: number
}

export type PosAuditEvent = {
  id: number
  eventType: string
  summary: string
  actor: string
  createdAt: string
}

export type PosLedgerTransaction = {
  id: string
  reference: string
  date: string
  time: string
  occurredAt?: string
  name: string
  category: string
  categoryKey?: string
  option?: string | null
  method: PosLedgerPaymentMethod
  amount: number
  totalAmount?: number
  amountPaid?: number
  balanceRemaining?: number
  cashImpact?: number
  points: number
  pointsReversed?: number
  status: string
  note: string
  supplier?: string
  supplierId?: string | null
  supplierMovementType?: string | null
  entryAgent: string
  entryAgentId?: string
  tillId?: string
  tillName?: string
  shiftId?: string
  outgoingType?: PosOutgoingType | null
  loyaltyAttached?: boolean
  loyaltyMemberMasked?: string | null
  refundableRemaining?: number
  sourceLinkId: string | null
  sourceLinks?: PosSourceLink[]
  refunds?: PosRefundSummary[]
  auditEvents?: PosAuditEvent[]
  tenders: PosLedgerTender[]
  isLegacy?: boolean
  isCorrected?: boolean
}

export type PosLedgerSummary = {
  moneyIn: number
  moneyOut: number
  netMovement: number
  cashNet: number
  cashIn?: number
  cashOut?: number
  cashRefunds?: number
  cardNet: number
  bankNet: number
  refunds?: number
  unreconciledCount: number
  activeDays?: number
}

export type PosLedgerFilters = {
  search?: string
  paymentMethod?: PosPaymentMethod
  direction?: PosDirection
  outgoingType?: PosOutgoingType
  status?: 'POSTED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'CORRECTED' | 'UNRECONCILED'
  categoryKey?: string
  supplierId?: string
  tillId?: string
  shiftId?: string
  agentId?: string
  sourceType?: PosSourceLink['sourceType']
  loyalty?: 'ATTACHED' | 'AWARDED' | 'REVERSED' | 'NONE'
  minAmount?: number
  maxAmount?: number
}

export type PosLedgerPayload = {
  items: PosLedgerTransaction[]
  summary: PosLedgerSummary
  nextCursor?: string | null
  context: {
    branchId: string
    branchName: string
    timezone: string
    period: PosLedgerPeriod
    date: string
    loadedAt: string
    source: 'pos_transactions' | 'daily_ledger_entries'
    truncated: boolean
    filters?: PosLedgerFilters
  }
}

export type PosCatalogueItem = {
  id: string
  key: string
  groupKey: string
  label: string
  optionLabel: string | null
  classification: 'SERVICE' | 'EXPENSE' | 'SUPPLIER' | 'REFUND' | 'CASH_MANAGEMENT'
  defaultDirection: PosDirection | 'TRANSFER'
  allowedDirections: Array<PosDirection | 'TRANSFER'>
  trackedSourceType: 'LMS' | 'TICKETING' | 'APPLICATIONS' | 'PACKAGES' | null
  sourceRequired: boolean
  customerRequired: boolean
  loyaltyEligible: boolean
  pointsPerGbp: number
  allowedPaymentMethods: PosPaymentMethod[]
  noteRequired: boolean
  priceRequired: boolean
  shortcut: string | null
  pricingOptions: Array<{ id: string; label: string; price: number }>
  categoryKey: string
  logoKey: string | null
}

export type PosCategory = {
  id: string
  key: string
  label: string
  description: string | null
  iconKey: string
  displayOrder: number
  supplierPaymentsEnabled: boolean
  services: PosCatalogueItem[]
  shortcuts: Array<{ key: string; label: string; target: 'REFUNDS_CORRECTIONS' }>
  supplierIds: string[]
  defaultSupplierId: string | null
}

export type PosTill = { id: string; code: string; name: string; currency: 'GBP' }

export type PosShift = {
  id: string
  tillId: string
  tillName: string
  businessDate: string
  status: 'OPEN' | 'CLOSED'
  openingFloat: number
  openedBy: string
  openedAt: string
}

export type PosBalances = { openingFloat: number; drawer: number; reserve: number }

export type PosSupplier = {
  id: string
  name: string
  alternateNames: string[]
  sourceArea: string | null
  sourceReference: string | null
  balance: number
  isActive: boolean
}

export type PosSupplierBalanceEntry = {
  id: string
  supplierId: string
  supplierName: string
  movementType: 'OPENING' | 'DEPOSIT' | 'USE_BALANCE' | 'REFUND' | 'CORRECTION'
  amount: number
  balanceDelta: number
  runningBalance: number
  reference: string | null
  note: string
  createdBy: string
  createdAt: string
}

export type PosSupplierLedgerPayload = {
  suppliers: PosSupplier[]
  entries: PosSupplierBalanceEntry[]
}

export type PosLoyaltyMember = {
  id: string
  customerCode: string
  maskedCode: string
  name: string
  maskedEmail: string
  availablePoints: number
}

export type PosLegacyImportPreview = {
  mode: 'DRY_RUN' | 'COMMIT'
  totalRows: number
  importableRows: number
  duplicateRows: number
  duplicates: Array<{ legacySource: string; legacyRowKey: string }>
  results?: PosMutationResult[]
}

export type PosCloseout = {
  id: string
  shiftId: string
  tillName: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  expectedDrawer: number
  countedDrawer: number
  drawerDifference: number
  expectedReserve: number
  countedReserve: number
  reserveDifference: number
  countedBy: string
  countedAt: string
  canApprove: boolean
}

export type PosBootstrapPayload = {
  schemaReady: boolean
  capabilityVersion: number
  branch: { id: string; name: string; timezone: string }
  catalogue: PosCatalogueItem[]
  categories: PosCategory[]
  tills: PosTill[]
  activeShift: PosShift | null
  balances: PosBalances
  suppliers: PosSupplier[]
  employees: Array<{ id: string; name: string }>
  closeouts: PosCloseout[]
  permissions: {
    canPost: boolean
    canManage: boolean
    canApprove: boolean
    canImport: boolean
    canViewCrossBranch: boolean
  }
  loadedAt: string
}

export type PosReportPayload = {
  range: { startDate: string; endDate: string }
  totals: PosLedgerSummary & {
    drawerBalance: number
    reserveBalance: number
    closeoutDifference: number
  }
  byCategory: Array<{ key: string; label: string; moneyIn: number; moneyOut: number; net: number }>
  byAgent: Array<{ id: string; name: string; moneyIn: number; moneyOut: number; net: number }>
  byPaymentMethod: Array<{
    method: PosPaymentMethod
    moneyIn: number
    moneyOut: number
    net: number
  }>
  suppliers: PosSupplier[]
  unreconciled: Array<{
    tenderId: string
    reference: string
    method: PosPaymentMethod
    amount: number
    status: PosReconciliationStatus
    externalReference: string | null
    kind: 'TRANSACTION' | 'REFUND'
  }>
}

export type PosMutationResult = {
  idempotentReplay: boolean
  reference?: string
  transactionId?: string
  refundId?: string
  shiftId?: string
  closeoutId?: string
  movementId?: string
  loyaltyPointsAwarded?: number
  loyaltyPointsReversed?: number
  balanceRemaining?: number
  drawerBalance?: number
  reserveBalance?: number
}
