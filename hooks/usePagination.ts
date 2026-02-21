/**
 * Table pagination hook
 * Handles page, limit, and offset calculations
 */
import { useState, useCallback, useMemo } from 'react'

export interface PaginationState {
  page: number
  limit: number
  total: number
}

export function usePagination(initialLimit = 50, initialTotal = 0) {
  const [state, setState] = useState<PaginationState>({
    page: 1,
    limit: Math.min(initialLimit, 100),
    total: initialTotal,
  })

  const offset = useMemo(() => (state.page - 1) * state.limit, [state.page, state.limit])

  const totalPages = useMemo(
    () => Math.ceil(state.total / state.limit),
    [state.total, state.limit]
  )

  const hasNextPage = useMemo(() => state.page < totalPages, [state.page, totalPages])
  const hasPrevPage = useMemo(() => state.page > 1, [state.page])

  const goToPage = useCallback((page: number) => {
    setState(prev => ({
      ...prev,
      page: Math.max(1, Math.min(page, totalPages)),
    }))
  }, [totalPages])

  const nextPage = useCallback(() => {
    setState(prev => ({
      ...prev,
      page: Math.min(prev.page + 1, totalPages),
    }))
  }, [totalPages])

  const prevPage = useCallback(() => {
    setState(prev => ({
      ...prev,
      page: Math.max(prev.page - 1, 1),
    }))
  }, [])

  const setLimit = useCallback((limit: number) => {
    setState(prev => ({
      ...prev,
      limit: Math.min(Math.max(limit, 1), 100),
      page: 1,
    }))
  }, [])

  const setTotal = useCallback((total: number) => {
    setState(prev => ({
      ...prev,
      total: Math.max(total, 0),
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      page: 1,
      limit: initialLimit,
      total: initialTotal,
    })
  }, [initialLimit, initialTotal])

  return {
    page: state.page,
    limit: state.limit,
    total: state.total,
    offset,
    totalPages,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    setLimit,
    setTotal,
    reset,
  }
}
