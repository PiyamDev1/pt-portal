/* eslint-disable import/prefer-default-export */
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { Account, LMSData, PaymentMethod } from './types'
import { API_ENDPOINTS } from './constants'
import type { SearchFilters } from './components/AdvancedSearchModal'

/**
 * Debounce Hook - Delays execution of a function until after a specified delay
 * Useful for search, filter, and other frequently-called operations
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

/**
 * Regular debounce function for callbacks
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * LMS Data Hook - Fetches LMS data and tracks loading state
 */
export function useLmsData(filter: string) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LMSData>({ accounts: [], stats: {} })
  const [page, setPage] = useState(1)
  const [pageInfo, setPageInfo] = useState<{ total: number; pages: number }>({ total: 0, pages: 0 })
  const previousFilterRef = useRef<string>('')

  const refresh = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_ENDPOINTS.LMS}?filter=${filter}&page=${pageNum}&limit=50`)
      const d = await res.json()
      setData(d)
      setPageInfo(d.pagination || { total: 0, pages: 0 })
      setPage(pageNum)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Only fetch when filter actually changes
  useEffect(() => {
    if (previousFilterRef.current !== filter) {
      previousFilterRef.current = filter
      refresh(1)
    }
  }, [filter, refresh])

  return { loading, data, refresh, page, pageInfo }
}

/**
 * LMS Filters Hook - Applies search and advanced filters
 */
export function useLmsFilters(
  accounts: Account[] | undefined,
  debouncedSearchTerm: string,
  searchFilters: SearchFilters
) {
  const filtered = useMemo(() => {
    let results = accounts || []

    if (debouncedSearchTerm) {
      results = results.filter((a: Account) =>
        a.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        a.phone?.includes(debouncedSearchTerm) ||
        a.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      )
    }

    if (searchFilters.dateFrom) {
      const from = new Date(searchFilters.dateFrom.split('/').reverse().join('-'))
      results = results.filter((a: Account) => {
        const dueDate = new Date(a.nextDue || '')
        return dueDate >= from
      })
    }

    if (searchFilters.dateTo) {
      const to = new Date(searchFilters.dateTo.split('/').reverse().join('-'))
      results = results.filter((a: Account) => {
        const dueDate = new Date(a.nextDue || '')
        return dueDate <= to
      })
    }

    if (searchFilters.minAmount !== undefined) {
      results = results.filter((a: Account) => a.balance >= searchFilters.minAmount!)
    }

    if (searchFilters.maxAmount !== undefined) {
      results = results.filter((a: Account) => a.balance <= searchFilters.maxAmount!)
    }

    if (searchFilters.hasOverdue) {
      results = results.filter((a: Account) => a.isOverdue)
    }

    if (searchFilters.hasDueSoon) {
      results = results.filter((a: Account) => a.isDueSoon && !a.isOverdue)
    }

    return results
  }, [accounts, debouncedSearchTerm, searchFilters])

  return { filtered }
}

/**
 * Installments Hook - Fetches installments per transaction for an account
 */
export function useInstallmentsByTransaction(account: Account) {
  const [localAccount, setLocalAccount] = useState(account)
  const [installmentsByTransaction, setInstallmentsByTransaction] = useState<Record<string, any[]>>({})

  const fetchInstallments = useCallback(async () => {
    if (!localAccount.transactions) return

    const serviceTransactions = localAccount.transactions.filter(
      (tx: any) => tx.transaction_type?.toLowerCase() === 'service'
    )

    const installmentsMap: Record<string, any[]> = {}

    for (const tx of serviceTransactions) {
      try {
        const res = await fetch(`/api/lms/installments?transactionId=${tx.id}`)
        if (res.ok) {
          const data = await res.json()
          installmentsMap[tx.id] = data.installments || []
        }
      } catch (err) {
        console.error('Failed to fetch installments for transaction:', tx.id, err)
      }
    }

    setInstallmentsByTransaction(installmentsMap)
  }, [localAccount])

  useEffect(() => {
    setLocalAccount(account)
    if (account.transactions) {
      fetchInstallments()
    }
  }, [account, fetchInstallments])

  return {
    localAccount,
    setLocalAccount,
    installmentsByTransaction,
    fetchInstallments
  }
}

/**
 * Payment Methods Hook - Fetches available payment methods
 */
export function usePaymentMethods(endpoint: string = API_ENDPOINTS.PAYMENT_METHODS) {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let isActive = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(endpoint)
        const data = await res.json()
        if (!isActive) return
        setMethods(data.methods || [])
      } catch (err) {
        console.error('Failed to load payment methods:', err)
        toast.error('Failed to load payment methods')
      } finally {
        if (isActive) setLoading(false)
      }
    }
    load()
    return () => {
      isActive = false
    }
  }, [endpoint])

  return { methods, loading }
}
