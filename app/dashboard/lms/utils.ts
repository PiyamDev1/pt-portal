export const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash' },
  { id: 'bank-transfer', name: 'Bank Transfer' },
  { id: 'card-payment', name: 'Card Payment' }
]

export const mergePaymentMethods = (fetched: any[] = []) => {
  const existing = new Set(fetched.map((m) => m.name?.toLowerCase?.()))
  const missing = DEFAULT_PAYMENT_METHODS.filter((m) => !existing.has(m.name.toLowerCase()))
  return [...fetched, ...missing]
}

export const formatTransactionType = (type: string) => {
  const t = (type || '').toLowerCase()
  if (t === 'service') return 'Installment Plan'
  if (t === 'fee') return 'Service Fee'
  if (t === 'payment') return 'Payment'
  return type
}
