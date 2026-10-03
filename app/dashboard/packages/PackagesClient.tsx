'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowDownWideNarrow,
  Building2,
  Bus,
  Calculator,
  ChevronDown,
  Clock3,
  Copy,
  CopyPlus,
  CreditCard,
  ExternalLink,
  FileText,
  FolderKanban,
  Link2,
  PackageCheck,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Save,
  Send,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  PackageComponentOption,
  PackageLinkedFlightGroup,
  PackageLimitedTimeOffer,
  PackageQuotePayload,
  PackageStayGroup,
  PackageVisaPassengerCategory,
  TravelPackageQuote,
  TravelPackageType,
} from '@/app/types/packages'
import type { TravelPackageGroup } from '@/app/types/packages'
import {
  buildCustomerPackageOptions,
  DEFAULT_CARD_PROCESSING_FEE_PERCENT,
  formatPackageQuoteForCopy,
  formatMoney,
  getDefaultPackageExpiry,
  getOrderedStaySelections,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  sortPackageOptionsLowToHigh,
} from '@/lib/packageQuote'
import { buildLinkedPackageGroupSnapshot, type TravelPackageGroupDetail } from '@/lib/packageGroups'
import { makeId, type UmrahTransportPricingData } from './packageTransportPricingModel'
import { FlightOptionEditor, newLinkedFlightGroup, OptionEditor } from './PackageOptionEditors'
import { PackageQuoteBrowser } from './PackageQuoteBrowser'
import {
  buildPackageShareUrl as buildShareUrl,
  formatPackageExpiry as formatExpiry,
  getPackageTimestamp as getTimestamp,
} from './packageQuoteBrowserModel'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

type PackagesClientProps = {
  currentUserId: string
  initialQuoteId?: string | null
}

type PackagesResponse = {
  packages: TravelPackageQuote[]
  setupRequired?: boolean
  message?: string
}

type SaveResponse = {
  quote: TravelPackageQuote | null
  setupRequired?: boolean
  message?: string
  error?: string
  packageSynced?: boolean
  packageSyncMessage?: string
}

type PackageGroupsResponse = {
  groups: TravelPackageGroup[]
  setupRequired?: boolean
  message?: string
  error?: string
}

type PackageGroupResponse = {
  group: TravelPackageGroupDetail | TravelPackageGroup | null
  setupRequired?: boolean
  message?: string
  error?: string
}

const PACKAGE_TYPES: Array<{ value: TravelPackageType; label: string }> = [
  { value: 'umrah', label: 'Umrah' },
  { value: 'ziyarat', label: 'Ziyarat' },
  { value: 'holiday', label: 'Holiday' },
]

const EXPIRED_QUOTE_BIN_AFTER_DAYS = 10
const MS_PER_DAY = 24 * 60 * 60 * 1000

function shouldMoveExpiredQuoteToBin(quote: TravelPackageQuote) {
  if (quote.status === 'archived' || !isPackageQuoteExpired(quote.expires_at)) return false
  const expiresAt = getTimestamp(quote.expires_at)
  if (!expiresAt) return false
  return Date.now() - expiresAt >= EXPIRED_QUOTE_BIN_AFTER_DAYS * MS_PER_DAY
}

function newOption(
  prefix: string,
  overrides: Partial<PackageComponentOption> = {},
): PackageComponentOption {
  const pricingMode = prefix === 'flight' || prefix === 'visa' ? 'per_person' : 'total'

  return {
    id: makeId(prefix),
    title: '',
    summary: '',
    price: 0,
    pricingMode,
    isDefault: false,
    adultPrice: 0,
    childPrice: 0,
    infantPrice: 0,
    ...overrides,
  }
}

function newLimitedTimeOffer(): PackageLimitedTimeOffer {
  return {
    id: makeId('offer'),
    title: 'Early bird offer',
    summary: 'Book and purchase this package by the deadline and get a discount.',
    expiresAt: '',
    discountAmount: 0,
    discountMode: 'total',
    discountType: 'early_bird',
    eligibleServices: ['flight', 'hotel', 'transport'],
    visaOptionId: null,
    visaPassengerCategory: 'all',
    reference: null,
    active: true,
  }
}

function makeQuoteShortRef() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = crypto.getRandomValues(new Uint8Array(6))
    return Array.from(values, (value) => characters[value % characters.length]).join('')
  }
  return Array.from(
    { length: 6 },
    () => characters[Math.floor(Math.random() * characters.length)],
  ).join('')
}

function formatQuoteNameDate(value: Date) {
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatQuoteTypeName(type: TravelPackageType) {
  const match = PACKAGE_TYPES.find((candidate) => candidate.value === type)
  return match?.label || 'Package'
}

function createDefaultStaySetup(packageType: TravelPackageType) {
  if (packageType === 'holiday') {
    const stayGroups = [
      {
        id: 'location-1',
        label: 'Location 1',
        options: [newOption('location-1-hotel', { isDefault: true })],
      },
    ]
    return {
      itineraryOrder: stayGroups.map((group) => group.id),
      stayGroups,
    }
  }

  const stayGroups = [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [newOption('makkah-hotel', { isDefault: true })],
    },
    {
      id: 'madinah',
      label: 'Madinah',
      options: [newOption('madinah-hotel', { isDefault: true })],
    },
  ]

  return {
    itineraryOrder: stayGroups.map((group) => group.id),
    stayGroups,
  }
}

function getQuoteTitleRef(title: string) {
  return (
    title.match(/^([A-Z0-9]{6})\s+-\s+/i)?.[1]?.toUpperCase() ||
    title.match(/\b([A-Z0-9]{6})$/i)?.[1]?.toUpperCase() ||
    ''
  )
}

function getQuoteTitleDate(title: string) {
  return (
    title.match(/^[A-Z0-9]{6}\s+-\s+.+?\s+Quotation\s+(.+)$/i)?.[1] ||
    title.match(/Quotation\s+(.+?)\s+-\s+[A-Z0-9]{6}$/i)?.[1] ||
    ''
  )
}

function buildSystematicQuoteTitle(payload: PackageQuotePayload, ref?: string) {
  const quoteRef = (ref || getQuoteTitleRef(payload.title) || makeQuoteShortRef()).toUpperCase()
  const quoteDate = getQuoteTitleDate(payload.title) || formatQuoteNameDate(new Date())
  return `${quoteRef} - ${formatQuoteTypeName(payload.packageType)} Quotation ${quoteDate}`
}

function withSystematicQuoteTitle(payload: PackageQuotePayload, ref?: string) {
  return normalizePackageQuotePayload({
    ...payload,
    title: buildSystematicQuoteTitle(payload, ref),
  })
}

function getNextPackageGroupFamilyLabel(group: TravelPackageGroupDetail | null) {
  return `Family ${Math.max(1, (group?.members.length || 0) + 1)}`
}

function isAutomaticPackageGroupFamilyLabel(value: string) {
  return /^family\s+\d+$/i.test(value.trim())
}

function preserveStayGroupItineraryOrder({
  currentOrder,
  nextGroups,
  replacedGroupId,
  replacementGroupId,
}: {
  currentOrder: string[]
  nextGroups: PackageStayGroup[]
  replacedGroupId?: string
  replacementGroupId?: string
}) {
  const nextGroupIds = new Set(nextGroups.map((group) => group.id))
  const orderedIds = currentOrder
    .map((groupId) =>
      replacedGroupId && replacementGroupId && groupId === replacedGroupId
        ? replacementGroupId
        : groupId,
    )
    .filter((groupId) => nextGroupIds.has(groupId))

  nextGroups.forEach((group) => {
    if (!orderedIds.includes(group.id)) orderedIds.push(group.id)
  })

  return orderedIds
}

function createInitialPayload(): PackageQuotePayload {
  const defaultStaySetup = createDefaultStaySetup('umrah')

  return withSystematicQuoteTitle({
    title: '',
    packageType: 'umrah',
    currency: 'GBP',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    adults: 2,
    childrenPaying: 0,
    childrenFree: 0,
    infants: 0,
    itineraryOrder: defaultStaySetup.itineraryOrder,
    departureDate: '',
    returnDate: '',
    stayGroups: defaultStaySetup.stayGroups,
    flightOptions: [newOption('flight', { isDefault: true })],
    linkedFlightGroups: [],
    visaOptions: [newOption('visa')],
    transportOptions: [newOption('transport', { isDefault: true, title: 'Option 1' })],
    limitedTimeOffers: [],
    cardProcessingFeePercent: DEFAULT_CARD_PROCESSING_FEE_PERCENT,
    depositRequired: false,
    depositAmount: 0,
    notes: '',
  })
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return getDefaultPackageExpiry()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return getDefaultPackageExpiry()
  return date.toISOString()
}

export default function PackagesClient({
  currentUserId,
  initialQuoteId = null,
}: PackagesClientProps) {
  const [payload, setPayload] = useState<PackageQuotePayload>(() => createInitialPayload())
  const [expiresAtInput, setExpiresAtInput] = useState(() =>
    toDateTimeLocalValue(getDefaultPackageExpiry()),
  )
  const [quotes, setQuotes] = useState<TravelPackageQuote[]>([])
  const [activeQuote, setActiveQuote] = useState<TravelPackageQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [cardProcessingExpanded, setCardProcessingExpanded] = useState(false)
  const [transportPricingData, setTransportPricingData] =
    useState<UmrahTransportPricingData | null>(null)
  const [packageGroups, setPackageGroups] = useState<TravelPackageGroup[]>([])
  const [activePackageGroup, setActivePackageGroup] = useState<TravelPackageGroupDetail | null>(
    null,
  )
  const [packageGroupLoading, setPackageGroupLoading] = useState(false)
  const [packageGroupSaving, setPackageGroupSaving] = useState(false)
  const [packageGroupSetupMessage, setPackageGroupSetupMessage] = useState<string | null>(null)
  const [packageGroupExpanded, setPackageGroupExpanded] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [linkedFamilyLabel, setLinkedFamilyLabel] = useState('Family 1')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [packageGroupSearch, setPackageGroupSearch] = useState('')
  const [quoteGroupSearch, setQuoteGroupSearch] = useState('')
  const [selectedQuoteForGroupId, setSelectedQuoteForGroupId] = useState('')
  const [selectedQuoteFamilyLabel, setSelectedQuoteFamilyLabel] = useState('Family 2')
  const [sharedTransportNote, setSharedTransportNote] = useState('')
  const [sharedFlightSelection, setSharedFlightSelection] = useState(false)

  const customerOptions = useMemo(() => buildCustomerPackageOptions(payload, 80), [payload])
  const systematicQuoteTitle = useMemo(() => buildSystematicQuoteTitle(payload), [payload])
  const stayGroupsForEditor = useMemo(() => {
    const groups = payload.stayGroups.map((group, groupIndex) => ({ group, groupIndex }))
    if (payload.packageType !== 'umrah') return groups
    return [...groups].sort((a, b) => {
      const aIndex = payload.itineraryOrder.findIndex((item) => a.group.id.startsWith(item))
      const bIndex = payload.itineraryOrder.findIndex((item) => b.group.id.startsWith(item))
      const aPosition = aIndex === -1 ? 999 : aIndex
      const bPosition = bIndex === -1 ? 999 : bIndex
      return aPosition - bPosition
    })
  }, [payload.itineraryOrder, payload.packageType, payload.stayGroups])
  const baseCustomerOption = customerOptions[0]?.combination || null
  const servicePassengerCount =
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  const payingGuestCount = payload.adults + payload.childrenPaying
  const getVisaQuantityFallback = (category: PackageVisaPassengerCategory | undefined) => {
    if (category === 'adult') return payload.adults
    if (category === 'child_5_plus') return payload.childrenPaying
    if (category === 'child_2_to_4') return payload.childrenFree
    if (category === 'infant') return payload.infants
    return servicePassengerCount
  }
  const shareUrl = buildShareUrl(activeQuote?.share_token)
  const activeQuotes = useMemo(
    () => quotes.filter((quote) => quote.status !== 'archived'),
    [quotes],
  )
  const filteredPackageGroups = useMemo(() => {
    const search = packageGroupSearch.trim().toLowerCase()
    const currentGroups = packageGroups.filter((group) => group.status !== 'archived')
    if (!search) return currentGroups
    return currentGroups.filter((group) =>
      `${group.group_reference} ${group.title}`.toLowerCase().includes(search),
    )
  }, [packageGroupSearch, packageGroups])
  const activePackageGroupQuoteIds = useMemo(
    () =>
      new Set(
        (activePackageGroup?.members || [])
          .map((member) => member.quote_id)
          .filter((quoteId): quoteId is string => Boolean(quoteId)),
      ),
    [activePackageGroup?.members],
  )
  const filteredLinkableQuotes = useMemo(() => {
    const search = quoteGroupSearch.trim().toLowerCase()
    return quotes
      .filter(
        (quote) =>
          quote.id !== activeQuote?.id &&
          quote.status !== 'archived' &&
          !activePackageGroupQuoteIds.has(quote.id),
      )
      .filter((quote) => {
        if (!search) return true
        const quotePayload = normalizePackageQuotePayload(quote.payload)
        return `${quote.title} ${quote.customer_name || ''} ${quote.customer_phone || ''} ${
          quote.customer_email || ''
        } ${quotePayload.customerName} ${quotePayload.customerPhone} ${quotePayload.customerEmail}`
          .toLowerCase()
          .includes(search)
      })
  }, [activePackageGroupQuoteIds, activeQuote?.id, quoteGroupSearch, quotes])

  const updatePayload = (changes: Partial<PackageQuotePayload>) => {
    setPayload((current) => ({ ...current, ...changes }))
  }

  const applyPackageType = (packageType: TravelPackageType) => {
    const defaultStaySetup = createDefaultStaySetup(packageType)
    setPayload((current) => {
      const nextPayload = normalizePackageQuotePayload({
        ...current,
        packageType,
        itineraryOrder: defaultStaySetup.itineraryOrder,
        stayGroups: defaultStaySetup.stayGroups,
        transportOptions:
          packageType === 'holiday'
            ? [newOption('transport', { isDefault: true, title: 'Option 1' })]
            : current.transportOptions,
      })

      return {
        ...nextPayload,
        title: buildSystematicQuoteTitle(nextPayload),
      }
    })
  }

  const persistActiveQuotePayload = useCallback(
    async (nextPayload: PackageQuotePayload) => {
      if (!activeQuote) return null
      const payloadToSave = normalizePackageQuotePayload({
        ...nextPayload,
        title: buildSystematicQuoteTitle(nextPayload),
      })
      const response = await fetch(`/api/packages/${activeQuote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: payloadToSave }),
      })
      const data = (await response.json()) as SaveResponse
      if (data.setupRequired || !response.ok || !data.quote) {
        throw new Error(data.message || data.error || 'Failed to save linked package group')
      }
      setActiveQuote(data.quote)
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setQuotes((current) => {
        const next = current.filter((quote) => quote.id !== data.quote!.id)
        return [data.quote!, ...next]
      })
      return data.quote
    },
    [activeQuote],
  )

  const persistPackageGroupSnapshot = useCallback(
    async (group: TravelPackageGroupDetail) => {
      if (!activeQuote) return
      const snapshot = buildLinkedPackageGroupSnapshot(group, { quoteId: activeQuote.id })
      const nextPayload = normalizePackageQuotePayload({
        ...payload,
        linkedPackageGroup: snapshot,
      })
      setPayload(nextPayload)
      const transportNote =
        snapshot.sharedServices.find(
          (service) => service.serviceType === 'transport' && service.customerVisible,
        )?.customerNote || ''
      setSharedTransportNote(transportNote)
      await persistActiveQuotePayload(nextPayload)
    },
    [activeQuote, payload, persistActiveQuotePayload],
  )

  const persistUnlinkedPackageGroupSnapshot = useCallback(async () => {
    if (!activeQuote) return
    const nextPayload = normalizePackageQuotePayload({
      ...payload,
      linkedPackageGroup: null,
    })
    setPayload(nextPayload)
    await persistActiveQuotePayload(nextPayload)
  }, [activeQuote, payload, persistActiveQuotePayload])

  const loadQuotes = useCallback(async () => {
    setLoading(true)
    try {
      const [activeResponse, binnedResponse] = await Promise.all([
        fetch('/api/packages'),
        fetch('/api/packages?status=archived'),
      ])
      const activeData = (await activeResponse.json()) as PackagesResponse
      const binnedData = (await binnedResponse.json()) as PackagesResponse
      if (!activeResponse.ok)
        throw new Error((activeData as { error?: string }).error || 'Failed to load packages')
      if (!binnedResponse.ok)
        throw new Error(
          (binnedData as { error?: string }).error || 'Failed to load binned packages',
        )

      const activeLoadedQuotes = activeData.packages || []
      const staleExpiredQuotes = activeLoadedQuotes.filter(shouldMoveExpiredQuoteToBin)
      const movedQuotes = await Promise.all(
        staleExpiredQuotes.map(async (quote) => {
          const response = await fetch(`/api/packages/${quote.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived', shareEnabled: false }),
          })
          const data = (await response.json()) as SaveResponse
          if (!response.ok || data.setupRequired || !data.quote) return null
          return data.quote
        }),
      )
      const movedQuoteIds = new Set(
        movedQuotes
          .map((quote) => quote?.id)
          .filter((quoteId): quoteId is string => Boolean(quoteId)),
      )
      const loadedQuotes = [
        ...activeLoadedQuotes.filter((quote) => !movedQuoteIds.has(quote.id)),
        ...(binnedData.packages || []),
        ...movedQuotes.filter((quote): quote is TravelPackageQuote => Boolean(quote)),
      ].sort((a, b) => getTimestamp(b.created_at) - getTimestamp(a.created_at))
      setQuotes(loadedQuotes)
      if (initialQuoteId) {
        const initialQuote = loadedQuotes.find((quote) => quote.id === initialQuoteId)
        if (initialQuote) {
          setActiveQuote(initialQuote)
          setPayload(withSystematicQuoteTitle(normalizePackageQuotePayload(initialQuote.payload)))
          setExpiresAtInput(toDateTimeLocalValue(initialQuote.expires_at))
        }
      }
      setSetupMessage(
        activeData.setupRequired || binnedData.setupRequired
          ? activeData.message || binnedData.message || 'Package quote schema is required.'
          : null,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }, [initialQuoteId])

  useEffect(() => {
    void loadQuotes()
  }, [loadQuotes])

  useEffect(() => {
    const loadTransportPricing = async () => {
      try {
        const response = await fetch('/api/pricing/umrah-transport')
        const data = (await response.json()) as UmrahTransportPricingData
        if (!response.ok)
          throw new Error((data as { error?: string }).error || 'Failed to load transport pricing')
        setTransportPricingData(data.setupRequired ? null : data)
      } catch (error) {
        console.error('[PackagesClient] Failed to load Umrah transport pricing:', error)
      }
    }

    void loadTransportPricing()
  }, [])

  const applyPackageGroupSnapshot = useCallback(
    (group: TravelPackageGroupDetail | null) => {
      if (!group || !activeQuote) return
      const snapshot = buildLinkedPackageGroupSnapshot(group, { quoteId: activeQuote.id })
      updatePayload({ linkedPackageGroup: snapshot })
      setSharedFlightSelection(snapshot.sharedFlightSelection)
      const transportNote =
        snapshot.sharedServices.find(
          (service) => service.serviceType === 'transport' && service.customerVisible,
        )?.customerNote || ''
      setSharedTransportNote(transportNote)
    },
    [activeQuote],
  )

  const loadPackageGroupDetail = useCallback(
    async (groupId: string, applySnapshot = true) => {
      if (!groupId) return null
      const response = await fetch(`/api/travel-package-groups/${groupId}`)
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        if (data.setupRequired) {
          setPackageGroupSetupMessage(data.message || 'Linked package group schema is required.')
          return null
        }
        throw new Error(data.error || 'Failed to load linked package group')
      }
      const detail = data.group as TravelPackageGroupDetail
      setActivePackageGroup(detail)
      setSelectedGroupId(detail.id)
      setNewGroupTitle(detail.title)
      const currentMember = detail.members.find((member) => member.quote_id === activeQuote?.id)
      setLinkedFamilyLabel(currentMember?.family_label || getNextPackageGroupFamilyLabel(detail))
      setSelectedQuoteFamilyLabel(getNextPackageGroupFamilyLabel(detail))
      const transportNote =
        detail.sharedServices.find(
          (service) => service.service_type === 'transport' && service.customer_visible,
        )?.customer_note || ''
      setSharedTransportNote(transportNote)
      setSharedFlightSelection(detail.metadata?.sharedFlightSelection === true)
      if (applySnapshot) applyPackageGroupSnapshot(detail)
      return detail
    },
    [activeQuote?.id, applyPackageGroupSnapshot],
  )

  const loadPackageGroups = useCallback(async () => {
    setPackageGroupLoading(true)
    try {
      const [allResponse, linkedResponse] = await Promise.all([
        fetch('/api/travel-package-groups?status=all'),
        activeQuote?.id
          ? fetch(`/api/travel-package-groups?quoteId=${activeQuote.id}`)
          : Promise.resolve(null),
      ])
      const allData = (await allResponse.json()) as PackageGroupsResponse
      if (!allResponse.ok || allData.setupRequired) {
        if (allData.setupRequired) {
          setPackageGroupSetupMessage(allData.message || 'Linked package group schema is required.')
          setPackageGroups([])
          return
        }
        throw new Error(allData.error || 'Failed to load package groups')
      }
      setPackageGroups(allData.groups || [])
      setPackageGroupSetupMessage(null)

      if (!linkedResponse) {
        setActivePackageGroup(null)
        setSelectedGroupId('')
        setSharedFlightSelection(false)
        return
      }

      const linkedData = (await linkedResponse.json()) as PackageGroupsResponse
      if (!linkedResponse.ok || linkedData.setupRequired) return
      const linkedGroup = linkedData.groups?.[0]
      if (linkedGroup) {
        await loadPackageGroupDetail(linkedGroup.id)
      } else {
        setActivePackageGroup(null)
        setSelectedGroupId('')
        setSharedFlightSelection(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load linked package groups')
    } finally {
      setPackageGroupLoading(false)
    }
  }, [activeQuote?.id, loadPackageGroupDetail])

  useEffect(() => {
    void loadPackageGroups()
  }, [loadPackageGroups])

  useEffect(() => {
    if (!activeQuote) {
      setActivePackageGroup(null)
      setSelectedGroupId('')
      setLinkedFamilyLabel('Family 1')
      setSharedTransportNote(payload.linkedPackageGroup?.sharedServices[0]?.customerNote || '')
      setSharedFlightSelection(false)
    }
  }, [activeQuote, payload.linkedPackageGroup?.sharedServices])

  const updateStayGroup = (groupIndex: number, nextGroup: PackageStayGroup) => {
    const previousGroupId = payload.stayGroups[groupIndex]?.id
    const nextGroups = payload.stayGroups.map((group, index) =>
      index === groupIndex ? nextGroup : group,
    )
    updatePayload({
      stayGroups: nextGroups,
      itineraryOrder: preserveStayGroupItineraryOrder({
        currentOrder: payload.itineraryOrder,
        nextGroups,
        replacedGroupId: previousGroupId,
        replacementGroupId: nextGroup.id,
      }),
    })
  }

  const addHolidayLocation = () => {
    const nextPosition = payload.stayGroups.length + 1
    const id = makeId('location')
    const nextGroups = [
      ...payload.stayGroups,
      {
        id,
        label: `Location ${nextPosition}`,
        options: [newOption(`${id}-hotel`, { isDefault: true })],
      },
    ]
    updatePayload({
      stayGroups: nextGroups,
      itineraryOrder: preserveStayGroupItineraryOrder({
        currentOrder: payload.itineraryOrder,
        nextGroups,
      }),
    })
  }

  const removeHolidayLocation = (groupIndex: number) => {
    if (payload.packageType !== 'holiday' || payload.stayGroups.length <= 1) return
    const nextGroups = payload.stayGroups.filter((_, index) => index !== groupIndex)
    updatePayload({
      stayGroups: nextGroups,
      itineraryOrder: preserveStayGroupItineraryOrder({
        currentOrder: payload.itineraryOrder,
        nextGroups,
      }),
    })
  }

  const sortStayGroupsByAdjustedCost = () => {
    updatePayload({
      stayGroups: payload.stayGroups.map((group) => ({
        ...group,
        options: sortPackageOptionsLowToHigh(group.options),
      })),
    })
    toast.success('Hotel options sorted low to high')
  }

  const updateComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    optionIndex: number,
    nextOption: PackageComponentOption,
  ) => {
    const nextOptions = payload[key].map((option, index) =>
      index === optionIndex ? nextOption : option,
    )
    const supportsDefault = key === 'flightOptions' || key === 'transportOptions'
    const linkedFlightGroups =
      key === 'flightOptions'
        ? payload.linkedFlightGroups.map((group) =>
            group.baseFlightOptionId === payload.flightOptions[optionIndex]?.id
              ? { ...group, baseFlightOptionId: nextOption.id }
              : group,
          )
        : payload.linkedFlightGroups
    updatePayload({
      [key]:
        supportsDefault && nextOption.isDefault
          ? nextOptions.map((option, index) => ({ ...option, isDefault: index === optionIndex }))
          : nextOptions,
      linkedFlightGroups,
    } as Partial<PackageQuotePayload>)
  }

  const removeComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    optionIndex: number,
  ) => {
    const current = payload[key]
    const removedId = current[optionIndex]?.id
    updatePayload({
      [key]: current.filter((_, index) => index !== optionIndex),
      linkedFlightGroups:
        key === 'flightOptions'
          ? payload.linkedFlightGroups.filter((group) => group.baseFlightOptionId !== removedId)
          : payload.linkedFlightGroups,
    } as Partial<PackageQuotePayload>)
  }

  const addComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    prefix: string,
  ) => {
    updatePayload({
      [key]: [
        ...payload[key],
        newOption(prefix, {
          title: key === 'transportOptions' ? `Option ${payload.transportOptions.length + 1}` : '',
          isDefault:
            (key === 'flightOptions' && payload.flightOptions.length === 0) ||
            (key === 'transportOptions' && payload.transportOptions.length === 0),
          quantity:
            key === 'visaOptions' && servicePassengerCount > 0 ? servicePassengerCount : undefined,
        }),
      ],
    } as Partial<PackageQuotePayload>)
  }

  const addLinkedFlightGroup = (baseFlightOptionId: string) => {
    updatePayload({
      linkedFlightGroups: [...payload.linkedFlightGroups, newLinkedFlightGroup(baseFlightOptionId)],
    })
  }

  const updateLinkedFlightGroup = (groupId: string, nextGroup: PackageLinkedFlightGroup) => {
    updatePayload({
      linkedFlightGroups: payload.linkedFlightGroups.map((group) =>
        group.id === groupId ? nextGroup : group,
      ),
    })
  }

  const removeLinkedFlightGroup = (groupId: string) => {
    updatePayload({
      linkedFlightGroups: payload.linkedFlightGroups.filter((group) => group.id !== groupId),
    })
  }

  const updateLimitedTimeOffer = (offerIndex: number, nextOffer: PackageLimitedTimeOffer) => {
    updatePayload({
      limitedTimeOffers: payload.limitedTimeOffers.map((offer, index) =>
        index === offerIndex ? nextOffer : offer,
      ),
    })
  }

  const removeLimitedTimeOffer = (offerIndex: number) => {
    updatePayload({
      limitedTimeOffers: payload.limitedTimeOffers.filter((_, index) => index !== offerIndex),
    })
  }

  const addLimitedTimeOffer = () => {
    updatePayload({ limitedTimeOffers: [...payload.limitedTimeOffers, newLimitedTimeOffer()] })
  }

  const upsertSharedTransportNote = async (group: TravelPackageGroupDetail, note: string) => {
    const existingService = group.sharedServices.find(
      (service) => service.service_type === 'transport',
    )
    const endpoint = `/api/travel-package-groups/${group.id}/shared-services`
    const response = await fetch(endpoint, {
      method: existingService ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        existingService
          ? {
              sharedServiceId: existingService.id,
              customerNote: note,
              customerVisible: Boolean(note.trim()),
            }
          : {
              serviceType: 'transport',
              title: 'Shared transport',
              customerNote: note,
              customerVisible: Boolean(note.trim()),
              allocationMode: 'no_split_note_only',
            },
      ),
    })
    const data = (await response.json()) as {
      error?: string
      setupRequired?: boolean
      message?: string
    }
    if (!response.ok || data.setupRequired) {
      throw new Error(data.message || data.error || 'Failed to save shared transport note')
    }
  }

  const buildQuoteGroupMemberMetadata = (quote: TravelPackageQuote) => {
    const quotePayload = normalizePackageQuotePayload(quote.payload)
    return {
      quoteTitle: quote.title,
      customerName: quote.customer_name || quotePayload.customerName,
      customerPhone: quote.customer_phone || quotePayload.customerPhone,
      customerEmail: quote.customer_email || quotePayload.customerEmail,
    }
  }

  const formatQuoteGroupOptionLabel = (quote: TravelPackageQuote) => {
    const quotePayload = normalizePackageQuotePayload(quote.payload)
    const customerName = quote.customer_name || quotePayload.customerName || 'No customer'
    const createdDate = new Date(quote.created_at).toLocaleDateString('en-GB')
    return `${quote.title} - ${customerName} - ${createdDate}`
  }

  const createPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save the quote before creating a linked package group')
      return
    }
    const title =
      newGroupTitle.trim() || `${payload.customerName || 'Linked families'} package group`
    setPackageGroupSaving(true)
    try {
      const response = await fetch('/api/travel-package-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          leadQuoteId: activeQuote.id,
          familyLabel: linkedFamilyLabel || 'Family 1',
          customerVisible: true,
          groupMetadata: { sharedFlightSelection },
          metadata: buildQuoteGroupMemberMetadata(activeQuote),
        }),
      })
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        throw new Error(data.message || data.error || 'Failed to create linked package group')
      }
      const createdGroup = data.group as TravelPackageGroup
      let detail = await loadPackageGroupDetail(createdGroup.id, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(createdGroup.id, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      await loadPackageGroups()
      toast.success('Linked package group created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create linked package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const linkSelectedPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save the quote before linking it to a package group')
      return
    }
    if (!selectedGroupId) {
      toast.error('Select a package group to link')
      return
    }
    setPackageGroupSaving(true)
    try {
      const detailBeforeLink =
        activePackageGroup?.id === selectedGroupId
          ? activePackageGroup
          : await loadPackageGroupDetail(selectedGroupId, false)
      const nextFamilyLabel = getNextPackageGroupFamilyLabel(detailBeforeLink)
      const familyLabel =
        linkedFamilyLabel.trim() && !isAutomaticPackageGroupFamilyLabel(linkedFamilyLabel)
          ? linkedFamilyLabel.trim()
          : nextFamilyLabel

      const response = await fetch(`/api/travel-package-groups/${selectedGroupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: activeQuote.id,
          familyLabel,
          customerVisible: true,
          sortOrder: (detailBeforeLink?.members.length || 0) * 10 + 10,
          metadata: buildQuoteGroupMemberMetadata(activeQuote),
        }),
      })
      const data = (await response.json()) as {
        error?: string
        setupRequired?: boolean
        message?: string
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Failed to link quote to package group')
      }
      let detail = await loadPackageGroupDetail(selectedGroupId, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(selectedGroupId, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      await loadPackageGroups()
      toast.success('Quote linked to package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const linkSelectedQuoteToPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save this quote before linking another quotation')
      return
    }
    const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteForGroupId)
    if (!selectedQuote) {
      toast.error('Select an existing quotation to link')
      return
    }
    if (activePackageGroupQuoteIds.has(selectedQuote.id)) {
      toast.error('This quotation is already linked to the active package group')
      return
    }
    setPackageGroupSaving(true)
    try {
      let groupId = activePackageGroup?.id || ''
      let nextMemberNumber = (activePackageGroup?.members.length || 0) + 1

      if (!groupId) {
        const groupTitle =
          newGroupTitle.trim() ||
          `${payload.customerName || activeQuote.customer_name || 'Linked families'} group`
        const createResponse = await fetch('/api/travel-package-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: groupTitle,
            leadQuoteId: activeQuote.id,
            familyLabel: linkedFamilyLabel || 'Family 1',
            customerVisible: true,
            groupMetadata: { sharedFlightSelection },
            metadata: buildQuoteGroupMemberMetadata(activeQuote),
          }),
        })
        const createData = (await createResponse.json()) as PackageGroupResponse
        if (!createResponse.ok || createData.setupRequired || !createData.group) {
          throw new Error(
            createData.message || createData.error || 'Failed to create linked package group',
          )
        }
        groupId = createData.group.id
        nextMemberNumber = 2
      }
      const selectedFamilyLabel =
        selectedQuoteFamilyLabel.trim() &&
        !isAutomaticPackageGroupFamilyLabel(selectedQuoteFamilyLabel)
          ? selectedQuoteFamilyLabel.trim()
          : `Family ${nextMemberNumber}`

      const linkResponse = await fetch(`/api/travel-package-groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: selectedQuote.id,
          familyLabel:
            selectedFamilyLabel ||
            selectedQuote.customer_name ||
            normalizePackageQuotePayload(selectedQuote.payload).customerName ||
            `Family ${nextMemberNumber}`,
          customerVisible: true,
          sortOrder: nextMemberNumber * 10,
          metadata: buildQuoteGroupMemberMetadata(selectedQuote),
        }),
      })
      const linkData = (await linkResponse.json()) as {
        error?: string
        setupRequired?: boolean
        message?: string
      }
      if (!linkResponse.ok || linkData.setupRequired) {
        throw new Error(linkData.message || linkData.error || 'Failed to link selected quotation')
      }

      let detail = await loadPackageGroupDetail(groupId, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(groupId, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      setSelectedQuoteForGroupId('')
      setQuoteGroupSearch('')
      setSelectedQuoteFamilyLabel(getNextPackageGroupFamilyLabel(detail || activePackageGroup))
      await loadPackageGroups()
      toast.success('Quotation linked to package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link selected quotation')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const saveSharedTransportNote = async () => {
    if (!activePackageGroup) {
      toast.error('Create or link a package group first')
      return
    }
    setPackageGroupSaving(true)
    try {
      await upsertSharedTransportNote(activePackageGroup, sharedTransportNote)
      const detail = await loadPackageGroupDetail(activePackageGroup.id, false)
      if (detail) await persistPackageGroupSnapshot(detail)
      toast.success('Shared transport note updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save shared transport note')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const saveSharedFlightSelection = async (nextValue = sharedFlightSelection) => {
    if (!activePackageGroup || !activeQuote) {
      toast.error('Create or link a package group first')
      return
    }
    setPackageGroupSaving(true)
    try {
      if (nextValue) {
        await persistActiveQuotePayload(payload)
      }
      const response = await fetch(`/api/travel-package-groups/${activePackageGroup.id}/flights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceQuoteId: activeQuote.id,
          enabled: nextValue,
        }),
      })
      const data = (await response.json()) as {
        syncedCount?: number
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save shared flight setting')
      }
      setSharedFlightSelection(nextValue)
      const detail = await loadPackageGroupDetail(activePackageGroup.id, false)
      if (detail) await persistPackageGroupSnapshot(detail)
      toast.success(
        nextValue
          ? `Shared flights copied to ${data.syncedCount || 0} linked quote${data.syncedCount === 1 ? '' : 's'}`
          : 'Shared flight matching disabled',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save shared flight setting')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const unlinkCurrentQuoteFromGroup = async () => {
    const member = activePackageGroup?.members.find(
      (candidate) => candidate.quote_id === activeQuote?.id,
    )
    if (!activePackageGroup || !member) {
      toast.error('This quote is not linked to the active package group')
      return
    }
    setPackageGroupSaving(true)
    try {
      const response = await fetch(
        `/api/travel-package-groups/${activePackageGroup.id}/members?memberId=${member.id}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as {
        error?: string
        message?: string
        setupRequired?: boolean
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Failed to unlink package group')
      }
      setActivePackageGroup(null)
      setSelectedGroupId('')
      setSharedTransportNote('')
      setSharedFlightSelection(false)
      setSelectedQuoteFamilyLabel('Family 2')
      await persistUnlinkedPackageGroupSnapshot()
      await loadPackageGroups()
      toast.success('Quote unlinked from package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unlink package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const saveQuote = async (shareEnabled: boolean) => {
    setSaving(true)
    try {
      const payloadToSave = normalizePackageQuotePayload({
        ...payload,
        title: systematicQuoteTitle,
      })
      const response = await fetch(
        activeQuote ? `/api/packages/${activeQuote.id}` : '/api/packages',
        {
          method: activeQuote ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: payloadToSave,
            expiresAt: fromDateTimeLocalValue(expiresAtInput),
            shareEnabled,
          }),
        },
      )
      const data = (await response.json()) as SaveResponse

      if (data.setupRequired) {
        setSetupMessage(data.message || 'Package quote schema is required.')
        toast.error('Package schema is not installed yet')
        return
      }

      if (!response.ok || !data.quote) {
        throw new Error(data.error || 'Failed to save package quote')
      }

      setActiveQuote(data.quote)
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setExpiresAtInput(toDateTimeLocalValue(data.quote.expires_at))
      setQuotes((current) => {
        const next = current.filter((quote) => quote.id !== data.quote!.id)
        return [data.quote!, ...next]
      })
      toast.success(
        data.packageSynced
          ? `${shareEnabled ? 'Package saved and share link enabled' : 'Package draft saved'}. Package folder refreshed.`
          : shareEnabled
            ? 'Package saved and share link enabled'
            : 'Package draft saved',
      )
      if (data.packageSynced === false && data.packageSyncMessage) {
        toast.warning(data.packageSyncMessage)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save package quote')
    } finally {
      setSaving(false)
    }
  }

  const archiveQuote = async () => {
    if (!activeQuote) return
    setSaving(true)
    try {
      const response = await fetch(`/api/packages/${activeQuote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', shareEnabled: false }),
      })
      const data = (await response.json()) as SaveResponse
      if (!response.ok) throw new Error(data.error || 'Failed to archive quote')
      setQuotes((current) => current.filter((quote) => quote.id !== activeQuote.id))
      setActiveQuote(null)
      setPayload(createInitialPayload())
      setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
      toast.success('Package quote archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive quote')
    } finally {
      setSaving(false)
    }
  }

  const copyAllOptions = async () => {
    if (customerOptions.length === 0) return
    const text = formatPackageQuoteForCopy(
      { ...payload, title: systematicQuoteTitle },
      Number.POSITIVE_INFINITY,
      activeQuote?.share_enabled ? shareUrl : '',
    )
    await navigator.clipboard.writeText(text)
    toast.success('Package options copied')
  }

  const copyShareLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Customer link copied')
  }

  const copyQuoteShareLink = async (quote: TravelPackageQuote) => {
    const url = buildShareUrl(quote.share_token)
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success('Customer link copied')
  }

  const openQuoteForEdit = (quote: TravelPackageQuote) => {
    const normalizedPayload = withSystematicQuoteTitle(normalizePackageQuotePayload(quote.payload))
    setActiveQuote(quote)
    setPayload(normalizedPayload)
    setExpiresAtInput(toDateTimeLocalValue(quote.expires_at))
    setSelectedQuoteForGroupId('')
    setQuoteGroupSearch('')
    setSelectedQuoteFamilyLabel('Family 2')
    setSharedTransportNote(
      normalizedPayload.linkedPackageGroup?.sharedServices.find(
        (service) => service.serviceType === 'transport' && service.customerVisible,
      )?.customerNote || '',
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duplicateQuote = async (quote: TravelPackageQuote) => {
    const sourcePayload = normalizePackageQuotePayload(quote.payload)
    const duplicatedPayload = withSystematicQuoteTitle(
      { ...sourcePayload, linkedPackageGroup: null },
      makeQuoteShortRef(),
    )
    const expiresAt = getDefaultPackageExpiry()
    setSaving(true)
    try {
      const response = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: duplicatedPayload,
          expiresAt,
          shareEnabled: false,
        }),
      })
      const data = (await response.json()) as SaveResponse

      if (data.setupRequired) {
        setSetupMessage(data.message || 'Package quote schema is required.')
        toast.error('Package schema is not installed yet')
        return
      }

      if (!response.ok || !data.quote) {
        throw new Error(data.error || 'Failed to duplicate package quote')
      }

      setActiveQuote(data.quote)
      setActivePackageGroup(null)
      setSelectedGroupId('')
      setPackageGroupSearch('')
      setSelectedQuoteForGroupId('')
      setQuoteGroupSearch('')
      setSelectedQuoteFamilyLabel('Family 2')
      setSharedTransportNote('')
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setExpiresAtInput(toDateTimeLocalValue(data.quote.expires_at))
      setQuotes((current) => [data.quote!, ...current.filter((item) => item.id !== data.quote!.id)])
      window.scrollTo({ top: 0, behavior: 'smooth' })
      toast.success('Quote duplicated and saved as a new draft')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate package quote')
    } finally {
      setSaving(false)
    }
  }

  const startNew = () => {
    setActiveQuote(null)
    setActivePackageGroup(null)
    setSelectedGroupId('')
    setPackageGroupSearch('')
    setSelectedQuoteForGroupId('')
    setQuoteGroupSearch('')
    setSelectedQuoteFamilyLabel('Family 2')
    setNewGroupTitle('')
    setLinkedFamilyLabel('Family 1')
    setSharedTransportNote('')
    setPayload(createInitialPayload())
    setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/dashboard/packages"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Packages
          </Link>
          <p className="text-xs font-bold text-slate-500">Package creator</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Holidays, ziyarat and umrah</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Build hotel, flight and transport options, save the quote, then share a customer link
            where they can choose their preferred mix and see the live total.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            New
          </button>
          {activeQuote && (
            <button
              type="button"
              onClick={() => void duplicateQuote(activeQuote)}
              disabled={saving}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-900 transition hover:bg-blue-100"
            >
              <CopyPlus className="h-4 w-4" />
              Duplicate
            </button>
          )}
          {activeQuote && (
            <a
              href={`/dashboard/packages/quotations/${activeQuote.id}/sales`}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <PackageCheck className="h-4 w-4" />
              Sales Mode
            </a>
          )}
          <button
            type="button"
            onClick={() => void saveQuote(false)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void saveQuote(true)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-bold text-white transition hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Save & Share
          </button>
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {setupMessage}
        </div>
      )}

      {shareUrl && activeQuote?.share_enabled && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            isPackageQuoteExpired(activeQuote.expires_at)
              ? 'border-red-200 bg-red-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-black ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {isPackageQuoteExpired(activeQuote.expires_at)
                ? 'Customer link has expired'
                : 'Customer link is active'}
            </p>
            <p
              className={`truncate text-sm ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-800' : 'text-emerald-800'
              }`}
            >
              {shareUrl}
            </p>
            <p
              className={`mt-1 text-xs font-bold ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              Expires {formatExpiry(activeQuote.expires_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            disabled={isPackageQuoteExpired(activeQuote.expires_at)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 className="h-4 w-4" />
            Copy Link
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] 2xl:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Quote details" />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-blue-800">
                  System quote name
                </span>
                <input
                  value={systematicQuoteTitle}
                  readOnly
                  className="min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
                />
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  Generated from package type, quote date, and a unique six-character reference.
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Type</span>
                <select
                  value={payload.packageType}
                  onChange={(event) => applyPackageType(event.target.value as TravelPackageType)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                >
                  {PACKAGE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Customer name</span>
                <input
                  value={payload.customerName}
                  onChange={(event) => updatePayload({ customerName: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Phone</span>
                <input
                  value={payload.customerPhone}
                  onChange={(event) => updatePayload({ customerPhone: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Email</span>
                <input
                  value={payload.customerEmail}
                  onChange={(event) => updatePayload({ customerEmail: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Quote expires
                </span>
                <input
                  type="datetime-local"
                  value={expiresAtInput}
                  min={toDateTimeLocalValue(new Date().toISOString())}
                  onChange={(event) => setExpiresAtInput(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Default is 72 hours from quote creation.
                </p>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {[
                ['Adults 12+', 'adults'],
                ['Children 5+', 'childrenPaying'],
                ['Children 2-5', 'childrenFree'],
                ['Infants under 2', 'infants'],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={payload[key as 'adults' | 'childrenPaying' | 'childrenFree' | 'infants']}
                    onChange={(event) =>
                      updatePayload({
                        [key]: Number(event.target.value || 0),
                      } as Partial<PackageQuotePayload>)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Departure</span>
                <input
                  type="date"
                  value={payload.departureDate}
                  onChange={(event) => updatePayload({ departureDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Return</span>
                <input
                  type="date"
                  value={payload.returnDate}
                  onChange={(event) => updatePayload({ returnDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setCardProcessingExpanded((current) => !current)}
                className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:bg-slate-50"
                aria-expanded={cardProcessingExpanded}
              >
                <span className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Credit Card processing fee</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-500">
                  {(payload.cardProcessingFeePercent || 0).toFixed(2)}%
                  <ChevronDown
                    className={`h-4 w-4 transition ${cardProcessingExpanded ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {cardProcessingExpanded && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">
                    Processing fee percentage
                  </span>
                  <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payload.cardProcessingFeePercent || ''}
                      onChange={(event) =>
                        updatePayload({
                          cardProcessingFeePercent: Number(event.target.value || 0),
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold outline-none"
                      placeholder="0.00"
                    />
                    <span className="ml-2 text-sm font-black text-slate-500">%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Applied only to the Credit Card amount. Processing fees are non-refundable.
                  </p>
                </label>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <button
                  type="button"
                  onClick={() => updatePayload({ depositRequired: !payload.depositRequired })}
                  className={`min-h-11 rounded-lg px-3 text-sm font-black transition ${
                    payload.depositRequired
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {payload.depositRequired ? 'Deposit required to secure' : 'No deposit required'}
                </button>
                <label className="block">
                  <span className="sr-only">Deposit amount</span>
                  <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
                    <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payload.depositAmount || ''}
                      onChange={(event) =>
                        updatePayload({ depositAmount: Number(event.target.value || 0) })
                      }
                      disabled={!payload.depositRequired}
                      className="w-full bg-transparent text-sm font-bold outline-none disabled:text-slate-400"
                      placeholder="Deposit"
                    />
                  </div>
                </label>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {payload.packageType === 'holiday' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="block text-xs font-bold text-slate-500">
                      Holiday starting point
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {payload.stayGroups[0]?.label || 'Location 1'}
                    </p>
                  </div>
                  <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800">
                    Location 1 is automatically first
                  </span>
                </div>
              ) : (
                <>
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    Itinerary order
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        label: 'Makkah first',
                        order: ['makkah', 'madinah'],
                      },
                      {
                        label: 'Madinah first',
                        order: ['madinah', 'makkah'],
                      },
                    ].map((item) => {
                      const active =
                        item.order.join('|') === payload.itineraryOrder.slice(0, 2).join('|')
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => updatePayload({ itineraryOrder: item.order })}
                          className={`min-h-10 rounded-lg px-3 text-sm font-black transition ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <Link2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-950">Linked package group</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-cyan-900">
                    {activePackageGroup
                      ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                      : activeQuote
                        ? 'No linked group active'
                        : 'Save this quote first to link family packages'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPackageGroupExpanded((current) => !current)}
                className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-50"
                aria-expanded={packageGroupExpanded}
              >
                {packageGroupExpanded ? 'Hide details' : 'Show details'}
                <ChevronDown
                  className={`h-4 w-4 transition ${packageGroupExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
            {activePackageGroup && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
                  {activePackageGroup.members.length} linked quote
                  {activePackageGroup.members.length === 1 ? '' : 's'}
                </span>
                {activePackageGroup.members.slice(0, 4).map((member) => (
                  <span
                    key={member.id}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${
                      member.quote_id === activeQuote?.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700'
                    }`}
                  >
                    {member.family_label}
                  </span>
                ))}
                {activePackageGroup.members.length > 4 && (
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500">
                    +{activePackageGroup.members.length - 4} more
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void saveSharedFlightSelection(!sharedFlightSelection)}
                  disabled={packageGroupSaving}
                  className={`inline-flex min-h-8 items-center gap-2 rounded-lg px-3 text-xs font-black transition disabled:opacity-50 ${
                    sharedFlightSelection
                      ? 'bg-sky-900 text-white hover:bg-sky-950'
                      : 'border border-sky-200 bg-white text-sky-900 hover:bg-sky-50'
                  }`}
                  title="Allow customers to select the same flight options across linked packages"
                >
                  <Plane className="h-3.5 w-3.5" />
                  Same flights across packages: {sharedFlightSelection ? 'Yes' : 'No'}
                </button>
              </div>
            )}
            {packageGroupExpanded && (
              <div className="mt-4">
                {packageGroupSetupMessage && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    {packageGroupSetupMessage}
                  </div>
                )}
                {!activeQuote ? (
                  <div className="rounded-lg border border-dashed border-cyan-300 bg-white/80 p-4 text-sm font-semibold text-cyan-900">
                    Save this quote first, then link it with another family package for shared
                    transport.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-lg border border-cyan-200 bg-white p-3">
                        <p className="text-sm font-black text-slate-950">Create new group</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Group name
                            </span>
                            <input
                              value={newGroupTitle}
                              onChange={(event) => setNewGroupTitle(event.target.value)}
                              placeholder={`${payload.customerName || 'Linked families'} package group`}
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              This family label
                            </span>
                            <input
                              value={linkedFamilyLabel}
                              onChange={(event) => setLinkedFamilyLabel(event.target.value)}
                              placeholder="Family Ali"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void createPackageGroup()}
                            disabled={packageGroupSaving}
                            className="self-end min-h-11 rounded-lg bg-cyan-900 px-3 text-sm font-black text-white transition hover:bg-cyan-950 disabled:opacity-50"
                          >
                            Create & Link
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-cyan-200 bg-white p-3">
                        <p className="text-sm font-black text-slate-950">Link existing group</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Search groups
                            </span>
                            <input
                              value={packageGroupSearch}
                              onChange={(event) => setPackageGroupSearch(event.target.value)}
                              placeholder="Search by group ref or name"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-cyan-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Package group
                            </span>
                            <select
                              value={selectedGroupId}
                              onChange={(event) => setSelectedGroupId(event.target.value)}
                              disabled={packageGroupLoading}
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-cyan-700 disabled:text-slate-400"
                            >
                              <option value="">
                                {packageGroupLoading ? 'Loading groups...' : 'Select group'}
                              </option>
                              {filteredPackageGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.group_reference} - {group.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void linkSelectedPackageGroup()}
                            disabled={packageGroupSaving || !selectedGroupId}
                            className="self-end min-h-11 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
                          >
                            Link
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 lg:col-span-2">
                        <p className="text-sm font-black text-slate-950">Link existing quotation</p>
                        <p className="mt-1 text-xs font-semibold text-blue-900">
                          Use this when both families already have separate quotations and no linked
                          group has been created yet.
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Search quotations
                            </span>
                            <input
                              value={quoteGroupSearch}
                              onChange={(event) => setQuoteGroupSearch(event.target.value)}
                              placeholder="Search by quote, customer, phone or email"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Existing quotation
                            </span>
                            <select
                              value={selectedQuoteForGroupId}
                              onChange={(event) => setSelectedQuoteForGroupId(event.target.value)}
                              disabled={loading}
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-700 disabled:text-slate-400"
                            >
                              <option value="">
                                {loading ? 'Loading quotes...' : 'Select quotation'}
                              </option>
                              {filteredLinkableQuotes.map((quote) => (
                                <option key={quote.id} value={quote.id}>
                                  {formatQuoteGroupOptionLabel(quote)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Their family label
                            </span>
                            <input
                              value={selectedQuoteFamilyLabel}
                              onChange={(event) => setSelectedQuoteFamilyLabel(event.target.value)}
                              placeholder="Family Hussain"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-700"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void linkSelectedQuoteToPackageGroup()}
                            disabled={packageGroupSaving || !selectedQuoteForGroupId}
                            className="min-h-11 rounded-lg bg-blue-900 px-3 text-sm font-black text-white transition hover:bg-blue-950 disabled:opacity-50 md:col-start-3"
                          >
                            {activePackageGroup ? 'Add Quote' : 'Create Group'}
                          </button>
                          {!loading && filteredLinkableQuotes.length === 0 && (
                            <p className="text-xs font-semibold text-slate-500 md:col-span-3">
                              No matching saved quotations found.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-cyan-200 bg-white p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            {activePackageGroup
                              ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                              : 'No linked group active'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Customer output will only show the note. Internal shared transport costs
                            stay hidden.
                          </p>
                        </div>
                        {activePackageGroup && (
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
                              {activePackageGroup.members.length} linked quote
                              {activePackageGroup.members.length === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void unlinkCurrentQuoteFromGroup()}
                              disabled={packageGroupSaving}
                              className="min-h-7 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              Unlink
                            </button>
                          </div>
                        )}
                      </div>
                      {activePackageGroup && activePackageGroup.members.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activePackageGroup.members.map((member) => (
                            <span
                              key={member.id}
                              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                                member.quote_id === activeQuote.id
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {member.family_label}
                            </span>
                          ))}
                        </div>
                      )}
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Shared transport customer note
                        </span>
                        <textarea
                          value={sharedTransportNote}
                          onChange={(event) => setSharedTransportNote(event.target.value)}
                          placeholder="Transport is shared with Family Hussain / PT-ABC123."
                          rows={3}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-700"
                        />
                      </label>
                      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-black text-slate-950">
                              Shared flight selection
                            </p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                              Allow customers to apply the same main and linked flight choices to
                              the other families in this group where matching options exist. Save
                              this setting for the customer match-flight option to appear.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void saveSharedFlightSelection(!sharedFlightSelection)}
                            disabled={!activePackageGroup}
                            className={`min-h-10 rounded-lg px-4 text-sm font-black transition disabled:opacity-50 ${
                              sharedFlightSelection
                                ? 'bg-sky-900 text-white hover:bg-sky-950'
                                : 'border border-sky-200 bg-white text-sky-900 hover:bg-sky-100'
                            }`}
                          >
                            {sharedFlightSelection ? 'Shared Flights: Yes' : 'Shared Flights: No'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveSharedTransportNote()}
                          disabled={packageGroupSaving || !activePackageGroup}
                          className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
                        >
                          Save Transport Note
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            activePackageGroup && applyPackageGroupSnapshot(activePackageGroup)
                          }
                          disabled={!activePackageGroup}
                          className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          Refresh Snapshot
                        </button>
                      </div>
                      {payload.linkedPackageGroup && (
                        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                          Snapshot ready on this quote. Press Save to persist it.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="min-w-0 rounded-xl border-2 border-sky-300 bg-sky-50/50 p-4 shadow-sm">
              <SectionHeader
                icon={Plane}
                title="Flight options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('flightOptions', 'flight')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add flight"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.flightOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No flight included. Use the plus button to add flight options.
                  </p>
                )}
                {payload.flightOptions.map((option, index) => (
                  <FlightOptionEditor
                    key={option.id}
                    option={option}
                    optionIndex={index}
                    linkedGroups={payload.linkedFlightGroups.filter(
                      (group) => group.baseFlightOptionId === option.id,
                    )}
                    onChange={(next) => updateComponentOption('flightOptions', index, next)}
                    onRemove={() => removeComponentOption('flightOptions', index)}
                    onAddLinkedGroup={() => addLinkedFlightGroup(option.id)}
                    onChangeLinkedGroup={updateLinkedFlightGroup}
                    onRemoveLinkedGroup={removeLinkedFlightGroup}
                  />
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <SectionHeader
                icon={FileText}
                title="Visa options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('visaOptions', 'visa')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add visa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.visaOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No visa included. Use the plus button to add visa options.
                  </p>
                )}
                {payload.visaOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder="Visa option"
                    summaryPlaceholder="ETA, tourist visa, multiple entry, insurance notes"
                    priceLabel="Visa cost"
                    showPricingMode
                    showQuantity
                    showVisaPassengerCategory
                    quantityFallback={getVisaQuantityFallback(option.visaPassengerCategory)}
                    canRemove
                    onChange={(next) => updateComponentOption('visaOptions', index, next)}
                    onRemove={() => removeComponentOption('visaOptions', index)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm lg:col-span-2">
              <SectionHeader
                icon={Bus}
                title="Transport options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('transportOptions', 'transport')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add transport"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.transportOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No transport included. Use the plus button to add transport options.
                  </p>
                )}
                {payload.transportOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder={`Option ${index + 1}`}
                    fallbackTitle={`Option ${index + 1}`}
                    summaryPlaceholder="Airport transfers, hotel transfers, ziyarat, vehicle type"
                    priceLabel="Transport cost"
                    showPricingMode
                    showDefaultToggle
                    defaultLabel="Preferred transport"
                    showTransportExtras
                    showTransportPriceList={payload.packageType !== 'holiday'}
                    transportPricingData={transportPricingData}
                    canRemove
                    onChange={(next) => updateComponentOption('transportOptions', index, next)}
                    onRemove={() => removeComponentOption('transportOptions', index)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
            <SectionHeader
              icon={Building2}
              title="Hotel and stay options"
              action={
                <div className="flex flex-wrap gap-2">
                  {payload.packageType === 'holiday' && (
                    <button
                      type="button"
                      onClick={addHolidayLocation}
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-violet-900 px-3 text-xs font-black text-white transition hover:bg-violet-950"
                      title="Add holiday location"
                    >
                      <Plus className="h-4 w-4" />
                      Add location
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={sortStayGroupsByAdjustedCost}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 text-xs font-black text-violet-900 transition hover:bg-violet-100"
                    title="Sort hotel options by adjusted cost"
                  >
                    <ArrowDownWideNarrow className="h-4 w-4" />
                    Sort low-high
                  </button>
                </div>
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {stayGroupsForEditor.map(({ group, groupIndex }) => (
                <div key={group.id} className="rounded-lg border border-violet-200 bg-white p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={group.label}
                      onChange={(event) =>
                        updateStayGroup(groupIndex, { ...group, label: event.target.value })
                      }
                      placeholder={payload.packageType === 'holiday' ? 'Enter location' : 'Stay'}
                      className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none focus:border-slate-900"
                    />
                    {payload.packageType === 'holiday' && groupIndex === 0 && (
                      <span className="rounded-lg bg-blue-100 px-2 py-2 text-[11px] font-black text-blue-800">
                        Start
                      </span>
                    )}
                    {payload.packageType === 'holiday' && payload.stayGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeHolidayLocation(groupIndex)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
                        title="Remove location"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        updateStayGroup(groupIndex, {
                          ...group,
                          options: [
                            ...group.options,
                            newOption(`${group.id}-hotel`, {
                              isDefault: group.options.length === 0,
                            }),
                          ],
                        })
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                      title="Add hotel"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {group.options.map((option, optionIndex) => (
                      <OptionEditor
                        key={option.id}
                        option={option}
                        titlePlaceholder={`${group.label} hotel`}
                        summaryPlaceholder={`${group.label} hotel summary, nights, board basis, distance`}
                        showHotelCostAudit
                        showDefaultToggle
                        defaultLabel="Preferred hotel"
                        canRemove={group.options.length > 1}
                        onChange={(next) =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: next.isDefault
                              ? group.options.map((candidate, index) => ({
                                  ...(index === optionIndex ? next : candidate),
                                  isDefault: index === optionIndex,
                                }))
                              : group.options.map((candidate, index) =>
                                  index === optionIndex ? next : candidate,
                                ),
                          })
                        }
                        onRemove={() =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: group.options.filter((_, index) => index !== optionIndex),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
            <SectionHeader
              icon={Tag}
              title="Discounts and offers"
              action={
                <button
                  type="button"
                  onClick={addLimitedTimeOffer}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                  title="Add offer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              }
            />
            {payload.limitedTimeOffers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">
                No adjustment added. Use the plus button for an Early Bird, Further Discount,
                previous Refund Adjustment, or passenger-specific Visa Special Discount.
              </p>
            ) : (
              <div className="space-y-3">
                {payload.limitedTimeOffers.map((offer, index) => (
                  <div
                    key={offer.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <input
                        value={offer.title}
                        onChange={(event) =>
                          updateLimitedTimeOffer(index, { ...offer, title: event.target.value })
                        }
                        placeholder="Offer title"
                        className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateLimitedTimeOffer(index, { ...offer, active: !offer.active })
                        }
                        className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                          offer.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {offer.active ? 'Active' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLimitedTimeOffer(index)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                        title="Remove offer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Discount type
                        </span>
                        <select
                          value={offer.discountType || 'early_bird'}
                          onChange={(event) => {
                            const discountType = event.target.value as NonNullable<
                              PackageLimitedTimeOffer['discountType']
                            >
                            updateLimitedTimeOffer(index, {
                              ...offer,
                              discountType,
                              eligibleServices:
                                discountType === 'visa_special'
                                  ? ['visa']
                                  : discountType === 'refund_adjustment'
                                    ? []
                                    : (offer.eligibleServices || []).filter(
                                          (service) => service !== 'visa',
                                        ).length
                                      ? (offer.eligibleServices || []).filter(
                                          (service) => service !== 'visa',
                                        )
                                      : ['flight', 'hotel', 'transport'],
                              visaOptionId:
                                discountType === 'visa_special'
                                  ? offer.visaOptionId || payload.visaOptions[0]?.id || null
                                  : null,
                              visaPassengerCategory:
                                discountType === 'visa_special'
                                  ? offer.visaPassengerCategory &&
                                    offer.visaPassengerCategory !== 'all'
                                    ? offer.visaPassengerCategory
                                    : payload.visaOptions[0]?.visaPassengerCategory &&
                                        payload.visaOptions[0].visaPassengerCategory !== 'all'
                                      ? payload.visaOptions[0].visaPassengerCategory
                                      : 'adult'
                                  : offer.visaPassengerCategory,
                            })
                          }}
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                        >
                          <option value="early_bird">Early Bird offer</option>
                          <option value="general_discount">General Further Discount</option>
                          <option value="refund_adjustment">Previous Refund Adjustment</option>
                          <option value="visa_special">Visa Special Discount</option>
                        </select>
                      </label>

                      {(offer.discountType || 'early_bird') === 'refund_adjustment' ? (
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold text-slate-500">
                            Previous package / refund reference
                          </span>
                          <input
                            value={offer.reference || ''}
                            onChange={(event) =>
                              updateLimitedTimeOffer(index, {
                                ...offer,
                                reference: event.target.value,
                              })
                            }
                            placeholder="For example: PT-ABC123 or refund reference"
                            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                          />
                        </label>
                      ) : (offer.discountType || 'early_bird') !== 'visa_special' ? (
                        <fieldset>
                          <legend className="mb-1 text-xs font-bold text-slate-500">
                            Allocate across
                          </legend>
                          <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            {(['flight', 'hotel', 'transport'] as const).map((service) => {
                              const checked = (
                                offer.eligibleServices || ['flight', 'hotel', 'transport']
                              ).includes(service)
                              return (
                                <label
                                  key={service}
                                  className="inline-flex items-center gap-2 text-xs font-black capitalize text-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const current = offer.eligibleServices || [
                                        'flight',
                                        'hotel',
                                        'transport',
                                      ]
                                      const eligibleServices = event.target.checked
                                        ? [...new Set([...current, service])]
                                        : current.filter((item) => item !== service)
                                      if (eligibleServices.length === 0) return
                                      updateLimitedTimeOffer(index, {
                                        ...offer,
                                        eligibleServices,
                                      })
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d]"
                                  />
                                  {service}
                                </label>
                              )
                            })}
                          </div>
                        </fieldset>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Visa option
                            </span>
                            <select
                              value={offer.visaOptionId || ''}
                              onChange={(event) => {
                                const option = payload.visaOptions.find(
                                  (candidate) => candidate.id === event.target.value,
                                )
                                updateLimitedTimeOffer(index, {
                                  ...offer,
                                  visaOptionId: event.target.value || null,
                                  visaPassengerCategory:
                                    option?.visaPassengerCategory &&
                                    option.visaPassengerCategory !== 'all'
                                      ? option.visaPassengerCategory
                                      : offer.visaPassengerCategory &&
                                          offer.visaPassengerCategory !== 'all'
                                        ? offer.visaPassengerCategory
                                        : 'adult',
                                })
                              }}
                              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                            >
                              <option value="">Select visa</option>
                              {payload.visaOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.title || 'Visa option'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Passenger
                            </span>
                            <select
                              value={offer.visaPassengerCategory || 'all'}
                              onChange={(event) =>
                                updateLimitedTimeOffer(index, {
                                  ...offer,
                                  visaPassengerCategory: event.target
                                    .value as PackageVisaPassengerCategory,
                                })
                              }
                              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                            >
                              <option value="adult">Adult 12+</option>
                              <option value="child_5_plus">Child 5+</option>
                              <option value="child_2_to_4">Child 2-4</option>
                              <option value="infant">Infant under 2</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Quantity
                            </span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={offer.visaQuantity || ''}
                              onChange={(event) =>
                                updateLimitedTimeOffer(index, {
                                  ...offer,
                                  visaQuantity: Number(event.target.value || 0),
                                })
                              }
                              placeholder="1"
                              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Deadline
                        </span>
                        <input
                          type="datetime-local"
                          value={offer.expiresAt ? toDateTimeLocalValue(offer.expiresAt) : ''}
                          onChange={(event) =>
                            updateLimitedTimeOffer(index, {
                              ...offer,
                              expiresAt: event.target.value
                                ? fromDateTimeLocalValue(event.target.value)
                                : '',
                            })
                          }
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          {(offer.discountType || 'early_bird') === 'refund_adjustment'
                            ? 'Credit amount'
                            : 'Discount'}
                        </span>
                        <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                          <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                          <input
                            value={offer.discountAmount || ''}
                            onChange={(event) =>
                              updateLimitedTimeOffer(index, {
                                ...offer,
                                discountAmount: Number(event.target.value || 0),
                              })
                            }
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full bg-transparent text-sm font-bold outline-none"
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">Mode</span>
                        <select
                          value={offer.discountMode}
                          onChange={(event) =>
                            updateLimitedTimeOffer(index, {
                              ...offer,
                              discountMode: event.target
                                .value as PackageLimitedTimeOffer['discountMode'],
                            })
                          }
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                        >
                          <option value="total">Total</option>
                          <option value="per_person">Per person</option>
                        </select>
                      </label>
                    </div>
                    <textarea
                      value={offer.summary}
                      onChange={(event) =>
                        updateLimitedTimeOffer(index, { ...offer, summary: event.target.value })
                      }
                      placeholder="Public offer wording"
                      rows={3}
                      className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader
              icon={Calculator}
              title="Generated options"
              action={
                <button
                  type="button"
                  onClick={() => void copyAllOptions()}
                  disabled={customerOptions.length === 0}
                  className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              }
            />
            {customerOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Add at least one priced hotel option in each stay group and one paying guest to
                generate totals.
              </div>
            ) : (
              <div className="max-h-[44rem] space-y-3 overflow-y-auto pr-1">
                {baseCustomerOption && (
                  <div className="rounded-lg border border-[#8b1e2d]/20 bg-red-50 p-3 text-xs text-slate-700">
                    <p className="text-sm font-black text-slate-950">Base package</p>
                    <p className="mt-1">
                      {baseCustomerOption.flightOption?.title || 'No flight'} ·{' '}
                      {baseCustomerOption.transportOption?.title || 'No transport'} ·{' '}
                      {baseCustomerOption.visaOptions.length > 0 ? 'Visa included' : 'No visa'}
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {formatMoney(baseCustomerOption.totalPrice, baseCustomerOption.currency)}
                    </p>
                  </div>
                )}
                {customerOptions.slice(0, 30).map(({ combination }, index) => {
                  const delta = baseCustomerOption
                    ? combination.totalPrice - baseCustomerOption.totalPrice
                    : 0
                  const perPersonDelta = payingGuestCount > 0 ? delta / payingGuestCount : delta
                  return (
                    <div key={combination.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-950">Option {index + 1}</p>
                          <p className="text-xs text-slate-500">
                            {index === 0
                              ? 'Included base hotel combination'
                              : `${perPersonDelta >= 0 ? '+' : '-'}${formatMoney(
                                  Math.abs(perPersonDelta),
                                  combination.currency,
                                )} pp`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-slate-950">
                            {formatMoney(combination.totalPrice, combination.currency)}
                          </p>
                          {combination.offerDiscountTotal > 0 && (
                            <p className="text-[11px] font-bold text-emerald-700">
                              {formatMoney(combination.offerDiscountTotal, combination.currency)}{' '}
                              off
                            </p>
                          )}
                          <p className="text-xs font-bold text-[#8b1e2d]">
                            {formatMoney(combination.perPersonPrice, combination.currency)} avg
                            hotel payer
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600">
                        {getOrderedStaySelections(payload, combination).map((stay) => (
                          <p key={`${combination.id}-${stay.groupId}`}>
                            <span className="font-bold text-slate-800">{stay.groupLabel}:</span>{' '}
                            {stay.option.title || 'Hotel option'}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Recent quotes" />
            {loading ? (
              <p className="text-sm text-slate-500">Loading quotes...</p>
            ) : activeQuotes.length === 0 ? (
              <p className="text-sm text-slate-500">No saved package quotes yet.</p>
            ) : (
              <div className="space-y-2">
                {activeQuotes.slice(0, 12).map((quote) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => openQuoteForEdit(quote)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      activeQuote?.id === quote.id
                        ? 'border-[#8b1e2d] bg-red-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{quote.title}</p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} ·{' '}
                          {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        {quote.status}
                      </span>
                    </div>
                    {quote.selected_at && (
                      <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        Customer selected an option
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {activeQuote && (
              <button
                type="button"
                onClick={() => void archiveQuote()}
                disabled={saving}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Archive Current Quote
              </button>
            )}
            <p className="mt-3 text-xs text-slate-400">Current user: {currentUserId.slice(0, 8)}</p>
          </section>
        </aside>
      </div>

      <PackageQuoteBrowser
        model={{
          quotes,
          packageGroups,
          activeQuoteId: activeQuote?.id || null,
          loading,
          saving,
          onOpenQuote: openQuoteForEdit,
          onDuplicateQuote: duplicateQuote,
          onCopyShareLink: copyQuoteShareLink,
        }}
      />
    </div>
  )
}
