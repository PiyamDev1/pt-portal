import { useEffect, useMemo } from 'react'
import { getPassportRecord } from './utils'
import type { Application } from './types'

type UsePassportListFilteringParams = {
  initialApplications: Application[]
  attentionMode: boolean
  searchQuery: string
  startDate: string
  endDate: string
  currentPage: number
  pageSize: number
  setCurrentPage: (page: number) => void
}

export function usePassportListFiltering({
  initialApplications,
  attentionMode,
  searchQuery,
  startDate,
  endDate,
  currentPage,
  pageSize,
  setCurrentPage,
}: UsePassportListFilteringParams) {
  const getCreatedAt = (item: Application) => {
    const pp = getPassportRecord(item)
    return item?.created_at || pp?.created_at || 0
  }

  const sortedApps = useMemo(
    () =>
      [...initialApplications].sort((a: Application, b: Application) => {
        const ad = new Date(getCreatedAt(a) || 0).getTime()
        const bd = new Date(getCreatedAt(b) || 0).getTime()
        return bd - ad
      }),
    [initialApplications],
  )

  const filteredApps = useMemo(
    () =>
      sortedApps.filter((item: Application) => {
        const matchesSearch = JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
        const status = getPassportRecord(item)?.status || 'Pending Submission'
        const matchesAttention = !attentionMode || status === 'Passport Arrived'

        if (!matchesSearch || !matchesAttention) return false

        if (startDate || endDate) {
          const itemDate = new Date(getCreatedAt(item))
          if (startDate && itemDate < new Date(startDate)) return false
          if (endDate) {
            const endDateTime = new Date(endDate)
            endDateTime.setHours(23, 59, 59, 999)
            if (itemDate > endDateTime) return false
          }
        }

        return true
      }),
    [sortedApps, searchQuery, attentionMode, startDate, endDate],
  )

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pageItems = filteredApps.slice(startIdx, startIdx + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, startDate, endDate, setCurrentPage])

  return { filteredApps, totalPages, startIdx, pageItems }
}