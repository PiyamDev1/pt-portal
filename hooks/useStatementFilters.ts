import { useMemo, useState } from 'react'
import { formatToISODate } from '@/lib/dateFormatter'
import { handleDateInput as coreHandleDateInput } from '@/lib/utils'
import type { Account, Transaction } from '@/app/types/lms'

type StatementFilterState = {
  type: string
  dateFrom: string
  dateTo: string
}

export const useStatementFilters = (account: Account | null) => {
  const [filter, setFilter] = useState({ type: '', dateFrom: '', dateTo: '' })

  // Re-export core utility for backward compatibility
  const handleDateInput = coreHandleDateInput

  const filteredTransactions = useMemo<Transaction[]>(() => {
    if (!account?.transactions) return []

    return account.transactions.filter((tx) => {
      const tType = (tx.transaction_type || '').toLowerCase()
      const fType = (filter.type || '').toLowerCase()
      if (fType && tType !== fType) return false

      const isoDateFrom = filter.dateFrom ? formatToISODate(filter.dateFrom) : ''
      const isoDateTo = filter.dateTo ? formatToISODate(filter.dateTo) : ''
      const txDate = tx.transaction_timestamp || tx.created_at

      if (isoDateFrom && new Date(txDate) < new Date(isoDateFrom)) return false
      if (isoDateTo && new Date(txDate) > new Date(isoDateTo)) return false
      return true
    })
  }, [account, filter])

  const totals = useMemo(() => {
    const debits = filteredTransactions
      .filter((tx) => {
        const t = (tx.transaction_type || '').toLowerCase()
        return t === 'service' || t === 'fee'
      })
      .reduce((sum: number, tx) => sum + parseFloat(String(tx.amount)), 0)

    const credits = filteredTransactions
      .filter((tx) => (tx.transaction_type || '').toLowerCase() === 'payment')
      .reduce((sum: number, tx) => sum + parseFloat(String(tx.amount)), 0)

    return { debits, credits }
  }, [filteredTransactions])

  return {
    filter,
    setFilter,
    handleDateInput,
    filteredTransactions,
    totals,
  }
}
