import { useMemo, useState } from 'react'
import { formatToISODate } from '@/app/lib/dateFormatter'

export const useStatementFilters = (account: any) => {
  const [filter, setFilter] = useState({ type: '', dateFrom: '', dateTo: '' })

  const handleDateInput = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
  }

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
