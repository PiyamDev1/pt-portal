import { useMemo, useState } from 'react'
import { formatToISODate } from '@/app/lib/dateFormatter'
import { handleDateInput as coreHandleDateInput } from '@/app/lib/utils'

export const useStatementFilters = (account: any) => {
  const [filter, setFilter] = useState({ type: '', dateFrom: '', dateTo: '' })

  // Re-export core utility for backward compatibility
  const handleDateInput = coreHandleDateInput

  const filteredTransactions = useMemo(() => {
    if (!account?.transactions) return []

    return account.transactions.filter((tx: any) => {
      const tType = (tx.transaction_type || '').toLowerCase()
      const fType = (filter.type || '').toLowerCase()
      if (fType && tType !== fType) return false

      const isoDateFrom = filter.dateFrom ? formatToISODate(filter.dateFrom) : ''
      const isoDateTo = filter.dateTo ? formatToISODate(filter.dateTo) : ''

      if (isoDateFrom && new Date(tx.transaction_timestamp) < new Date(isoDateFrom)) return false
      if (isoDateTo && new Date(tx.transaction_timestamp) > new Date(isoDateTo)) return false
      return true
    })
  }, [account, filter])

  const totals = useMemo(() => {
    const debits = filteredTransactions
      .filter((tx: any) => {
        const t = (tx.transaction_type || '').toLowerCase()
        return t === 'service' || t === 'fee'
      })
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0)

    const credits = filteredTransactions
      .filter((tx: any) => (tx.transaction_type || '').toLowerCase() === 'payment')
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0)

    return { debits, credits }
  }, [filteredTransactions])

  return {
    filter,
    setFilter,
    handleDateInput,
    filteredTransactions,
    totals
  }
}
