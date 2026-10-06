'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bus,
  CopyPlus,
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
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  sortPackageOptionsLowToHigh,
} from '@/lib/packageQuote'
import { buildLinkedPackageGroupSnapshot, type TravelPackageGroupDetail } from '@/lib/packageGroups'
import { makeId, type UmrahTransportPricingData } from './packageTransportPricingModel'
import { formatPackageTypeName } from './packageQuoteEditorModel'
import { PackageLinkedGroupWorkspace } from './PackageLinkedGroupWorkspace'
import { PackageQuoteDetails } from './PackageQuoteDetails'
import { PackageDiscountOffers } from './PackageDiscountOffers'
import { PackageQuoteSidebar } from './PackageQuoteSidebar'
import { PackageStayOptions } from './PackageStayOptions'
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
  return `${quoteRef} - ${formatPackageTypeName(payload.packageType)} Quotation ${quoteDate}`
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
  const [transportPricingData, setTransportPricingData] =
    useState<UmrahTransportPricingData | null>(null)
  const [packageGroups, setPackageGroups] = useState<TravelPackageGroup[]>([])
  const [activePackageGroup, setActivePackageGroup] = useState<TravelPackageGroupDetail | null>(
    null,
  )
  const [packageGroupLoading, setPackageGroupLoading] = useState(false)
  const [packageGroupSaving, setPackageGroupSaving] = useState(false)
  const [packageGroupSetupMessage, setPackageGroupSetupMessage] = useState<string | null>(null)
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
  const activePackageGroupQuoteIds = useMemo(
    () =>
      new Set(
        (activePackageGroup?.members || [])
          .map((member) => member.quote_id)
          .filter((quoteId): quoteId is string => Boolean(quoteId)),
      ),
    [activePackageGroup?.members],
  )
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
          <PackageQuoteDetails
            model={{
              payload,
              systematicQuoteTitle,
              expiresAtInput,
              minimumExpiryInput: toDateTimeLocalValue(new Date().toISOString()),
              updatePayload,
              applyPackageType,
              setExpiresAtInput,
            }}
          />

          <PackageLinkedGroupWorkspace
            model={{
              activeQuote,
              activePackageGroup,
              activePackageGroupQuoteIds,
              payload: {
                customerName: payload.customerName,
                linkedPackageGroup: payload.linkedPackageGroup,
              },
              packageGroups,
              quotes,
              loading,
              packageGroupLoading,
              packageGroupSaving,
              packageGroupSetupMessage,
              newGroupTitle,
              linkedFamilyLabel,
              selectedGroupId,
              packageGroupSearch,
              quoteGroupSearch,
              selectedQuoteForGroupId,
              selectedQuoteFamilyLabel,
              sharedTransportNote,
              sharedFlightSelection,
              setNewGroupTitle,
              setLinkedFamilyLabel,
              setSelectedGroupId,
              setPackageGroupSearch,
              setQuoteGroupSearch,
              setSelectedQuoteForGroupId,
              setSelectedQuoteFamilyLabel,
              setSharedTransportNote,
              createPackageGroup,
              linkSelectedPackageGroup,
              linkSelectedQuoteToPackageGroup,
              saveSharedTransportNote,
              saveSharedFlightSelection,
              unlinkCurrentQuoteFromGroup,
              applyPackageGroupSnapshot,
            }}
          />

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

          <PackageStayOptions
            model={{
              payload: {
                packageType: payload.packageType,
                stayGroups: payload.stayGroups,
              },
              stayGroupsForEditor,
              transportPricingData,
              createHotelOption: (groupId, isDefault) => newOption(groupId, { isDefault }),
              onUpdateStayGroup: updateStayGroup,
              onAddHolidayLocation: addHolidayLocation,
              onRemoveHolidayLocation: removeHolidayLocation,
              onSortStayGroupsByAdjustedCost: sortStayGroupsByAdjustedCost,
            }}
          />

          <PackageDiscountOffers
            model={{
              payload,
              addLimitedTimeOffer,
              removeLimitedTimeOffer,
              updateLimitedTimeOffer,
              toDateTimeLocalValue,
              fromDateTimeLocalValue,
            }}
          />
        </div>

        <PackageQuoteSidebar
          model={{
            customerOptions,
            baseCustomerOption,
            payingGuestCount,
            payload,
            activeQuotes,
            activeQuote,
            loading,
            saving,
            currentUserId,
            onCopyAllOptions: copyAllOptions,
            onOpenQuote: openQuoteForEdit,
            onArchiveQuote: archiveQuote,
          }}
        />
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
