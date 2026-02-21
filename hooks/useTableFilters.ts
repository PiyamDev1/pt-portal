/**
 * Table filtering and sorting hook
 * Handles search, filters, and sorting state
 */
import { useState, useCallback, useMemo } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface FilterState {
  search: string
  filters: Record<string, any>
  sortBy?: string
  sortDirection: SortDirection
}

export function useTableFilters<T extends Record<string, any>>(
  items: T[] = [],
  filterFn?: (item: T, search: string, filters: Record<string, any>) => boolean
) {
  const [state, setState] = useState<FilterState>({
    search: '',
    filters: {},
    sortBy: undefined,
    sortDirection: 'asc',
  })

  const setSearch = useCallback((search: string) => {
    setState(prev => ({ ...prev, search }))
  }, [])

  const setFilter = useCallback((key: string, value: any) => {
    setState(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [key]: value,
      },
    }))
  }, [])

  const clearFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      filters: {},
      search: '',
    }))
  }, [])

  const setSortBy = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      sortBy: field,
      sortDirection: prev.sortBy === field && prev.sortDirection === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  const filteredItems = useMemo(() => {
    if (!filterFn) return items

    return items.filter(item => filterFn(item, state.search, state.filters))
  }, [items, state.search, state.filters, filterFn])

  const sortedItems = useMemo(() => {
    if (!state.sortBy) return filteredItems

    const sorted = [...filteredItems].sort((a, b) => {
      const aVal = a[state.sortBy!]
      const bVal = b[state.sortBy!]

      if (aVal === bVal) return 0

      const comparison = aVal < bVal ? -1 : 1
      return state.sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [filteredItems, state.sortBy, state.sortDirection])

  return {
    ...state,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
    filteredItems: sortedItems,
    itemCount: sortedItems.length,
  }
}
