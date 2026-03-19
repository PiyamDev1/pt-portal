import { useEffect, useMemo } from 'react'
import { getDetails, getNadraRecord, normalizeStatus } from './helpers'
import type { NadraApplication, NadraFamilyGroup } from '@/app/types/nadra'

type UseNadraApplicationFilteringParams = {
  applications: NadraApplication[]
  searchQuery: string
  statusFilter: string
  serviceTypeFilter: string
  serviceOptionFilter: string
  startDate: string
  endDate: string
  showEmptyFamilies: boolean
  complainedNadraIds: Set<string>
  currentPage: number
  pageSize: number
  setCurrentPage: (value: number | ((prev: number) => number)) => void
  normalizeLookupValue: (value: string | null | undefined) => string
}

type UseNadraApplicationFilteringResult = {
  filteredApplications: NadraApplication[]
  groupedEntries: [string, NadraFamilyGroup][]
  groupedData: Record<string, NadraFamilyGroup>
  filteredFamilyCount: number
  complaintsSubmittedCount: number
  activeFilterCount: number
  totalPages: number
  startIdx: number
}

const getCreatedAt = (item: NadraApplication) => {
  const nadra = getNadraRecord(item)
  return nadra?.created_at || item?.created_at || 0
}

const parseDdMmYyyy = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return null

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const parsed = new Date(year, month - 1, day)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

export default function useNadraApplicationFiltering({
  applications,
  searchQuery,
  statusFilter,
  serviceTypeFilter,
  serviceOptionFilter,
  startDate,
  endDate,
  showEmptyFamilies,
  complainedNadraIds,
  currentPage,
  pageSize,
  setCurrentPage,
  normalizeLookupValue,
}: UseNadraApplicationFilteringParams): UseNadraApplicationFilteringResult {
  const sortedApplications = useMemo(
    () =>
      [...applications].sort((a, b) => {
        const ad = new Date(getCreatedAt(a) || 0).getTime()
        const bd = new Date(getCreatedAt(b) || 0).getTime()
        return bd - ad
      }),
    [applications],
  )

  const filteredApplications = useMemo(
    () =>
      sortedApplications.filter((item) => {
        const query = searchQuery.toLowerCase()
        const nadra = getNadraRecord(item)
        const status = normalizeStatus(nadra?.status || 'Pending Submission')

        const matchesSearch =
          item.applicants?.first_name?.toLowerCase().includes(query) ||
          item.applicants?.last_name?.toLowerCase().includes(query) ||
          item.applicants?.citizen_number?.includes(query) ||
          item.tracking_number?.toLowerCase().includes(query) ||
          item.family_heads?.citizen_number?.includes(query)

        const matchesStatus = statusFilter === 'All' || status === normalizeStatus(statusFilter)

        const serviceType = nadra?.service_type || ''
        const matchesServiceType =
          serviceTypeFilter === 'All' ||
          normalizeLookupValue(serviceType) === normalizeLookupValue(serviceTypeFilter)

        const details = getDetails(nadra)
        const serviceOption = details?.service_option || ''
        const matchesServiceOption =
          serviceOptionFilter === 'All' ||
          normalizeLookupValue(serviceOption) === normalizeLookupValue(serviceOptionFilter)

        if (startDate || endDate) {
          const itemDate = new Date(getCreatedAt(item))
          const itemTime = itemDate.getTime()
          if (!Number.isFinite(itemTime)) return false

          const start = parseDdMmYyyy(startDate)
          const end = parseDdMmYyyy(endDate)

          if (start && itemTime < start.getTime()) return false
          if (end) {
            end.setHours(23, 59, 59, 999)
            if (itemTime > end.getTime()) return false
          }
        }

        const hasRealMember = !!(item.applicants || item.nadra_services)
        if (!showEmptyFamilies && !hasRealMember) return false

        return matchesSearch && matchesStatus && matchesServiceType && matchesServiceOption
      }),
    [
      sortedApplications,
      searchQuery,
      statusFilter,
      serviceTypeFilter,
      serviceOptionFilter,
      startDate,
      endDate,
      showEmptyFamilies,
      normalizeLookupValue,
    ],
  )

  const groupedEntries = useMemo(() => {
    const groupedMap = filteredApplications.reduce<Record<string, NadraFamilyGroup>>((acc, item) => {
      const headCnic = item.family_heads?.citizen_number || 'Independent'
      if (!acc[headCnic]) {
        acc[headCnic] = { head: item.family_heads, members: [] }
      }
      const hasRealMember = !!(item.applicants || item.nadra_services)
      if (hasRealMember) acc[headCnic].members.push(item)
      return acc
    }, {})

    return (Object.entries(groupedMap) as [string, NadraFamilyGroup][]).sort((a, b) => {
      const aGroup = a[1]
      const bGroup = b[1]
      const aHasMembers = aGroup.members.length > 0
      const bHasMembers = bGroup.members.length > 0

      if (aHasMembers !== bHasMembers) return aHasMembers ? -1 : 1

      if (aHasMembers && bHasMembers) {
        const aLatest = Math.max(
          ...aGroup.members.map((member) => new Date(getCreatedAt(member) || 0).getTime()),
        )
        const bLatest = Math.max(
          ...bGroup.members.map((member) => new Date(getCreatedAt(member) || 0).getTime()),
        )
        return bLatest - aLatest
      }

      const aName = `${aGroup.head?.first_name || ''} ${aGroup.head?.last_name || ''}`
        .trim()
        .toLowerCase()
      const bName = `${bGroup.head?.first_name || ''} ${bGroup.head?.last_name || ''}`
        .trim()
        .toLowerCase()
      if (aName !== bName) return aName.localeCompare(bName)

      const aCnic = String(a[0] || '').toLowerCase()
      const bCnic = String(b[0] || '').toLowerCase()
      return aCnic.localeCompare(bCnic)
    })
  }, [filteredApplications])

  const totalPages = Math.ceil(groupedEntries.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pagedGroupedEntries = groupedEntries.slice(startIdx, startIdx + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchQuery,
    statusFilter,
    serviceTypeFilter,
    serviceOptionFilter,
    startDate,
    endDate,
    showEmptyFamilies,
    setCurrentPage,
  ])

  const groupedData = useMemo(
    () => Object.fromEntries(pagedGroupedEntries),
    [pagedGroupedEntries],
  )

  const filteredFamilyCount = useMemo(
    () =>
      new Set(
        filteredApplications
          .map((item) => item.family_heads?.citizen_number)
          .filter((value): value is string => Boolean(value)),
      ).size,
    [filteredApplications],
  )

  const complaintsSubmittedCount = useMemo(
    () =>
      filteredApplications.filter((item) => {
        const nadraId = getNadraRecord(item)?.id
        return nadraId && complainedNadraIds.has(nadraId)
      }).length,
    [filteredApplications, complainedNadraIds],
  )

  const activeFilterCount = [
    statusFilter !== 'All',
    serviceTypeFilter !== 'All',
    serviceOptionFilter !== 'All',
    Boolean(startDate),
    Boolean(endDate),
    showEmptyFamilies,
  ].filter(Boolean).length

  return {
    filteredApplications,
    groupedEntries,
    groupedData,
    filteredFamilyCount,
    complaintsSubmittedCount,
    activeFilterCount,
    totalPages,
    startIdx,
  }
}
