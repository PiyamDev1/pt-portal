/**
 * Module: app/dashboard/applications/passports/components/usePassportListFiltering.ts
 * Dashboard module for applications/passports/components/usePassportListFiltering.ts.
 */

import { useEffect, useMemo } from 'react'
import { getPassportRecord } from './utils'
import type { Application } from './types'

const normalizeSearchValue = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const compactSearchValue = (value: unknown) => normalizeSearchValue(value).replace(/[^a-z0-9]/g, '')

const buildSearchTerms = (query: string) =>
  normalizeSearchValue(query)
    .split(' ')
    .map((term) => term.trim())
    .filter(Boolean)

type UsePassportListFilteringParams = {
  initialApplications: Application[]
  attentionMode: boolean
  searchQuery: string
  statusFilter: string
  speedFilter: string
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
  statusFilter,
  speedFilter,
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
        const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
        const passport = getPassportRecord(item)
        const searchTerms = buildSearchTerms(searchQuery)
        const searchableFields = [
          item.tracking_number,
          applicant?.first_name,
          applicant?.last_name,
          `${applicant?.first_name || ''} ${applicant?.last_name || ''}`,
          applicant?.citizen_number,
          applicant?.email,
          applicant?.phone_number,
          passport?.application_type,
          passport?.category,
          passport?.page_count,
          passport?.speed,
          passport?.status,
          passport?.requested_page_number,
          passport?.requested_page_provided ? 'page provided' : 'page requested',
          passport?.old_passport_number,
          passport?.new_passport_number,
          passport?.family_head_email,
          passport?.notes,
        ]
        const normalizedFields = searchableFields.map(normalizeSearchValue).filter(Boolean)
        const compactFields = searchableFields.map(compactSearchValue).filter(Boolean)
        const matchesSearch =
          searchTerms.length === 0 ||
          searchTerms.every((term) => {
            const compactTerm = compactSearchValue(term)
            return normalizedFields.some((field) => field.includes(term)) ||
              compactFields.some((field) => compactTerm && field.includes(compactTerm))
          })

        const status = getPassportRecord(item)?.status || 'Pending Submission'
        const speed = passport?.speed || ''
        const matchesAttention = !attentionMode || status === 'Passport Arrived'
        const matchesStatus = statusFilter === 'All' || status === statusFilter
        const matchesSpeed = speedFilter === 'All' || speed === speedFilter

        if (!matchesSearch || !matchesAttention || !matchesStatus || !matchesSpeed) return false

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
    [sortedApps, searchQuery, attentionMode, statusFilter, speedFilter, startDate, endDate],
  )

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pageItems = filteredApps.slice(startIdx, startIdx + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, speedFilter, startDate, endDate, setCurrentPage])

  return { filteredApps, totalPages, startIdx, pageItems }
}
