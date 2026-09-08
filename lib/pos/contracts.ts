export type PosLedgerPeriod = 'day' | 'month'

export type PosLedgerPaymentMethod = 'Cash' | 'Card' | 'Bank' | 'Split' | 'Other'

export type PosLedgerTender = {
  method: Exclude<PosLedgerPaymentMethod, 'Split'>
  amount: number
  direction: 'IN' | 'OUT'
  reconciliationStatus: 'CLEARED' | 'OWED_TO_US' | 'UNPAID_DEBT_IN'
}

export type PosLedgerTransaction = {
  id: string
  reference: string
  date: string
  time: string
  name: string
  category: string
  method: PosLedgerPaymentMethod
  amount: number
  points: number
  status: string
  note: string
  supplier?: string
  entryAgent: string
  sourceLinkId: string | null
  tenders: PosLedgerTender[]
}

export type PosLedgerSummary = {
  moneyIn: number
  moneyOut: number
  netMovement: number
  cashNet: number
  cardNet: number
  bankNet: number
  unreconciledCount: number
}

export type PosLedgerPayload = {
  items: PosLedgerTransaction[]
  summary: PosLedgerSummary
  context: {
    branchId: string
    branchName: string
    timezone: string
    period: PosLedgerPeriod
    date: string
    loadedAt: string
    source: 'daily_ledger_entries'
    truncated: boolean
  }
}
