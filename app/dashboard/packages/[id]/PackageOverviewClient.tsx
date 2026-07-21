'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  BadgePoundSterling,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  Plane,
  Plus,
  ShieldCheck,
  Stamp,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type {
  PackageCombination,
  PackageComponentOption,
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
  TravelPackageGroup,
  TravelPackageInvoice,
  TravelPackageInvoiceStatus,
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'
import {
  PACKAGE_DOCUMENT_CATEGORIES,
  groupPackageDocumentsByCategory,
} from '@/lib/packageDocuments'
import PackageOperationsWorkspace from './PackageOperationsWorkspace'
import PackageInvoiceLinesEditor from './PackageInvoiceLinesEditor'

type PackageOverviewClientProps = {
  packageId: string
}

type PackageWorkspaceTab = 'overview' | 'documents' | 'reservations' | 'invoice'

type PackageResponse = {
  package?: TravelPackageFolder | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type ReservationsResponse = {
  reservations?: TravelPackageReservation[]
  reservation?: TravelPackageReservation | null
  items?: TravelPackageReservationItem[]
  item?: TravelPackageReservationItem | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type DocumentsResponse = {
  documents?: TravelPackageDocument[]
  document?: TravelPackageDocument | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type InvoiceResponse = {
  invoice?: TravelPackageInvoice | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type PackageGroupsResponse = {
  groups?: TravelPackageGroup[]
  setupRequired?: boolean
  message?: string
  error?: string
}

type PackageGroupResponse = {
  group?: TravelPackageGroupDetail | TravelPackageGroup | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type ReservationFormState = {
  reservationType: TravelPackageReservationType
  title: string
  status: TravelPackageReservationStatus
  supplierName: string
  supplierReference: string
  bookedCostTotal: string
  soldPriceTotal: string
  discountTotal: string
  commissionExpectedTotal: string
  depositRequired: boolean
  depositAmount: string
  paymentDueAt: string
  internalNotes: string
}

type ReservationItemFormState = {
  itemType: TravelPackageReservationItemType
  title: string
  status: TravelPackageReservationItemStatus
  quantity: string
  unitBookedCost: string
  unitSoldPrice: string
  discountAmount: string
  commissionExpectedAmount: string
  supplierReference: string
  description: string
}

type ReservationFinancialFormState = {
  bookedCostTotal: string
  soldPriceTotal: string
  discountTotal: string
  commissionExpectedTotal: string
  depositRequired: boolean
  depositAmount: string
  paymentDueAt: string
}

type QuoteReservationPrefill = {
  key: string
  reservationType: TravelPackageReservationType
  title: string
  bookedCostTotal?: number
  soldPriceTotal: number
  internalNotes: string
}

type InvoiceFormState = {
  status: TravelPackageInvoiceStatus
  subtotalSold: string
  discountTotal: string
  totalPaid: string
  totalBookedCost: string
  expectedCommissionTotal: string
  receivedCommissionTotal: string
  releasedToCustomer: boolean
  customerTerms: string
  internalNotes: string
  dueAt: string
  amendmentReason: string
}

const reservationTypeOptions: Array<{ value: TravelPackageReservationType; label: string }> = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

const reservationStatusOptions: Array<{ value: TravelPackageReservationStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'quote_requested', label: 'Quote requested' },
  { value: 'availability_checked', label: 'Availability checked' },
  { value: 'reservation_pending', label: 'Reservation pending' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'deposit_required', label: 'Deposit required' },
  { value: 'paid', label: 'Paid' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'changed', label: 'Changed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
]

const reservationItemTypeOptions: Array<{
  value: TravelPackageReservationItemType
  label: string
}> = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transport', label: 'Transport' },
  { value: 'commission', label: 'Commission' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
]

const reservationItemStatusOptions: Array<{
  value: TravelPackageReservationItemStatus
  label: string
}> = [
  { value: 'draft', label: 'Draft' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'changed', label: 'Changed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const invoiceStatusOptions: Array<{ value: TravelPackageInvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'finalised', label: 'Finalised' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'released', label: 'Released (customer snapshot live)' },
  { value: 'amended', label: 'Amended draft' },
  { value: 'void', label: 'Void' },
  { value: 'closed', label: 'Closed' },
]

const CUSTOMER_PORTAL_URL = 'https://bookings.piyamtravel.com'

function toDateTimeLocalValue(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function createInitialReservationForm(soldPriceTotal = 0): ReservationFormState {
  return {
    reservationType: 'flight',
    title: '',
    status: 'reservation_pending',
    supplierName: '',
    supplierReference: '',
    bookedCostTotal: '',
    soldPriceTotal: soldPriceTotal > 0 ? String(soldPriceTotal) : '',
    discountTotal: '',
    commissionExpectedTotal: '',
    depositRequired: false,
    depositAmount: '',
    paymentDueAt: toDateTimeLocalValue(),
    internalNotes: '',
  }
}

function createInitialReservationItemForm(
  itemType: TravelPackageReservationItemType = 'other',
): ReservationItemFormState {
  return {
    itemType,
    title: '',
    status: 'draft',
    quantity: '1',
    unitBookedCost: '',
    unitSoldPrice: '',
    discountAmount: '',
    commissionExpectedAmount: '',
    supplierReference: '',
    description: '',
  }
}

function createInitialInvoiceForm(invoice?: TravelPackageInvoice | null): InvoiceFormState {
  return {
    status: invoice?.status || 'draft',
    subtotalSold: invoice ? String(invoice.subtotal_sold || '') : '',
    discountTotal: invoice ? String(invoice.discount_total || '') : '',
    totalPaid: invoice ? String(invoice.total_paid || '') : '',
    totalBookedCost: invoice ? String(invoice.total_booked_cost || '') : '',
    expectedCommissionTotal: invoice ? String(invoice.expected_commission_total || '') : '',
    receivedCommissionTotal: invoice ? String(invoice.received_commission_total || '') : '',
    releasedToCustomer: Boolean(invoice?.released_to_customer),
    customerTerms: invoice?.customer_terms || '',
    internalNotes: invoice?.internal_notes || '',
    dueAt: invoice?.due_at ? toDateTimeLocalValue(invoice.due_at) : toDateTimeLocalValue(),
    amendmentReason: invoice?.amendment_reason || '',
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatReservationStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function mapInvoiceToPackageInvoiceStatus(invoice: TravelPackageInvoice) {
  if (invoice.status === 'void') return 'void'
  if (invoice.released_to_customer || invoice.status === 'released') return 'released_to_customer'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.status === 'amended') return 'amended'
  if (invoice.status === 'internal_review') return 'internal_review'
  if (invoice.status === 'closed') return 'closed'
  return 'finalised'
}

function formatFileSize(bytes: number) {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPaymentMethod(method: string | null | undefined) {
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Credit Card'
  return 'Bank transfer'
}

function parseMoneyInput(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSelectedCombination(
  combination: PackageCombination | null | undefined,
): PackageCombination | null {
  if (!combination) return null

  return {
    ...combination,
    staySelections: Array.isArray(combination.staySelections)
      ? combination.staySelections.filter((stay) => stay?.option)
      : [],
    visaOptions: Array.isArray(combination.visaOptions)
      ? combination.visaOptions.filter(Boolean)
      : [],
    appliedOffers: Array.isArray(combination.appliedOffers)
      ? combination.appliedOffers.filter(Boolean)
      : [],
    flightOption: combination.flightOption || null,
    visaOption: combination.visaOption || null,
    transportOption: combination.transportOption || null,
    packageSubtotalPrice: Number(combination.packageSubtotalPrice || 0),
    paymentSurchargeTotal: Number(combination.paymentSurchargeTotal || 0),
    totalPrice: Number(combination.totalPrice || 0),
    grossPrice: Number(combination.grossPrice || combination.totalPrice || 0),
    offerDiscountTotal: Number(combination.offerDiscountTotal || 0),
    perPersonPrice: Number(combination.perPersonPrice || 0),
    payingGuests: Number(combination.payingGuests || 0),
    servicePassengers: Number(combination.servicePassengers || 0),
    currency: combination.currency || 'GBP',
    paymentMethod: combination.paymentMethod || 'bank_transfer',
  }
}

function getVisaQuantity(option: { quantity?: number }, servicePassengers: number) {
  return option.quantity && option.quantity > 0 ? option.quantity : servicePassengers
}

function getOptionSoldTotal(
  option: PackageComponentOption | null | undefined,
  servicePassengers: number,
  passengers?: TravelPackageFolder['passenger_summary'],
) {
  if (!option) return 0
  if (option.adultPrice || option.childPrice || option.infantPrice) {
    return (
      Number(option.adultPrice || 0) * Number(passengers?.adults || 0) +
      Number(option.childPrice || 0) *
        (Number(passengers?.childrenPaying || 0) + Number(passengers?.childrenFree || 0)) +
      Number(option.infantPrice || 0) * Number(passengers?.infants || 0)
    )
  }
  if (option.pricingMode === 'per_person') return Number(option.price || 0) * servicePassengers
  return Number(option.price || 0)
}

function getReservationSummary(option: PackageComponentOption | null | undefined) {
  return (
    option?.summary?.trim() ||
    'Pulled from the final quote. Agent to complete supplier references, booked cost, and confirmation status.'
  )
}

function getTransportReservationSummary(option: PackageComponentOption | null | undefined) {
  if (!option?.transportRoutes?.length) return getReservationSummary(option)
  const routeLines = option.transportRoutes.map((route) => {
    const supplier = route.supplierName ? ` - ${route.supplierName}` : ''
    const vehicle = route.vehicleLabel ? ` (${route.vehicleLabel})` : ''
    const gbpCost =
      route.costPriceGbp && route.costPriceGbp > 0 ? ` - GBP ${route.costPriceGbp.toFixed(2)}` : ''
    const sourceCost =
      route.currency !== 'GBP' && route.costPrice > 0
        ? ` (${route.currency} ${route.costPrice.toFixed(2)} at ${Number(route.exchangeRate || 0).toFixed(4)} SAR/GBP)`
        : ''
    return `* ${route.routeName}${supplier}${vehicle}${gbpCost}${sourceCost}`
  })
  const netCost =
    option.transportNetCost && option.transportNetCost > 0
      ? `Net transport cost: ${option.transportNetCurrency || 'GBP'} ${option.transportNetCost.toFixed(2)}`
      : ''
  return [option.summary?.trim(), ...routeLines, netCost].filter(Boolean).join('\n')
}

function createReservationFinancialForm(
  reservation: TravelPackageReservation,
): ReservationFinancialFormState {
  return {
    bookedCostTotal: String(reservation.booked_cost_total || ''),
    soldPriceTotal: String(reservation.sold_price_total || ''),
    discountTotal: String(reservation.discount_total || ''),
    commissionExpectedTotal: String(reservation.commission_expected_total || ''),
    depositRequired: reservation.deposit_required,
    depositAmount: String(reservation.deposit_amount || ''),
    paymentDueAt: reservation.payment_due_at
      ? toDateTimeLocalValue(reservation.payment_due_at)
      : '',
  }
}

function getReservationIcon(type: TravelPackageReservationType) {
  if (type === 'flight') return Plane
  if (type === 'hotel') return Building2
  if (type === 'visa') return Stamp
  if (type === 'transport') return Car
  return PackageCheck
}

function StatusCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof PackageCheck
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 text-sm font-black capitalize text-slate-950">
        {value.replace(/_/g, ' ')}
      </p>
    </div>
  )
}

export default function PackageOverviewClient({ packageId }: PackageOverviewClientProps) {
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [reservations, setReservations] = useState<TravelPackageReservation[]>([])
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [invoice, setInvoice] = useState<TravelPackageInvoice | null>(null)
  const [reservationForm, setReservationForm] = useState<ReservationFormState>(() =>
    createInitialReservationForm(),
  )
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(() => createInitialInvoiceForm())
  const [draggingDocumentCategory, setDraggingDocumentCategory] =
    useState<TravelPackageDocumentCategory | null>(null)
  const [itemForms, setItemForms] = useState<Record<string, ReservationItemFormState>>({})
  const [reservationFinancialForms, setReservationFinancialForms] = useState<
    Record<string, ReservationFinancialFormState>
  >({})
  const [loading, setLoading] = useState(true)
  const [reservationsLoading, setReservationsLoading] = useState(false)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [savingReservation, setSavingReservation] = useState(false)
  const [savingItemReservationId, setSavingItemReservationId] = useState<string | null>(null)
  const [savingReservationFinancialId, setSavingReservationFinancialId] = useState<string | null>(
    null,
  )
  const [savingDocument, setSavingDocument] = useState(false)
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null)
  const [updatingReservationId, setUpdatingReservationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reservationError, setReservationError] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [showQuoteSnapshot, setShowQuoteSnapshot] = useState(false)
  const [showAccessVoucher, setShowAccessVoucher] = useState(false)
  const [accessVoucherQr, setAccessVoucherQr] = useState('')
  const [accessVoucherCopyMessage, setAccessVoucherCopyMessage] = useState('')
  const [activePackageTab, setActivePackageTab] = useState<PackageWorkspaceTab>('overview')
  const [expandedReservationIds, setExpandedReservationIds] = useState<Record<string, boolean>>({})
  const [packageGroups, setPackageGroups] = useState<TravelPackageGroup[]>([])
  const [activePackageGroup, setActivePackageGroup] = useState<TravelPackageGroupDetail | null>(
    null,
  )
  const [packageGroupLoading, setPackageGroupLoading] = useState(false)
  const [packageGroupSaving, setPackageGroupSaving] = useState(false)
  const [packageGroupError, setPackageGroupError] = useState<string | null>(null)
  const [packageGroupTitle, setPackageGroupTitle] = useState('')
  const [packageGroupFamilyLabel, setPackageGroupFamilyLabel] = useState('Family')
  const [packageGroupSelectedId, setPackageGroupSelectedId] = useState('')
  const [packageGroupSearch, setPackageGroupSearch] = useState('')
  const [packageGroupTransportNote, setPackageGroupTransportNote] = useState('')

  useEffect(() => {
    const loadPackageFolder = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/travel-packages/${encodeURIComponent(packageId)}`)
        const data = (await response.json()) as PackageResponse
        if (!response.ok || !data.package) {
          throw new Error(data.message || data.error || 'Travel package not found')
        }
        setPackageFolder(data.package)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load package')
      } finally {
        setLoading(false)
      }
    }

    void loadPackageFolder()
  }, [packageId])

  useEffect(() => {
    const loadReservations = async () => {
      setReservationsLoading(true)
      setReservationError(null)
      try {
        const response = await fetch(
          `/api/travel-packages/${encodeURIComponent(packageId)}/reservations`,
        )
        const data = (await response.json()) as ReservationsResponse
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Unable to load package reservations')
        }
        if (data.setupRequired) {
          setReservationError(data.message || 'Reservation schema is not installed yet')
          setReservations([])
          return
        }
        const reservationList = data.reservations || []
        const withItems = await Promise.all(
          reservationList.map(async (reservation) => {
            try {
              const itemsResponse = await fetch(
                `/api/travel-packages/${encodeURIComponent(
                  packageId,
                )}/reservations/${encodeURIComponent(reservation.id)}/items`,
              )
              const itemsData = (await itemsResponse.json()) as ReservationsResponse
              if (!itemsResponse.ok || itemsData.setupRequired) return reservation
              return { ...reservation, items: itemsData.items || [] }
            } catch {
              return reservation
            }
          }),
        )
        setReservations(withItems)
        setItemForms((current) => {
          const next = { ...current }
          withItems.forEach((reservation) => {
            if (!next[reservation.id]) {
              next[reservation.id] = createInitialReservationItemForm(reservation.reservation_type)
            }
          })
          return next
        })
        setReservationFinancialForms((current) => {
          const next = { ...current }
          withItems.forEach((reservation) => {
            if (!next[reservation.id]) {
              next[reservation.id] = createReservationFinancialForm(reservation)
            }
          })
          return next
        })
      } catch (loadError) {
        setReservationError(
          loadError instanceof Error ? loadError.message : 'Unable to load package reservations',
        )
      } finally {
        setReservationsLoading(false)
      }
    }

    void loadReservations()
  }, [packageId])

  useEffect(() => {
    const loadDocuments = async () => {
      setDocumentsLoading(true)
      setDocumentError(null)
      try {
        const response = await fetch(
          `/api/travel-packages/${encodeURIComponent(packageId)}/documents`,
        )
        const data = (await response.json()) as DocumentsResponse
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Unable to load package documents')
        }
        if (data.setupRequired) {
          setDocumentError(data.message || 'Document schema is not installed yet')
          setDocuments([])
          return
        }
        setDocuments(data.documents || [])
      } catch (loadError) {
        setDocumentError(
          loadError instanceof Error ? loadError.message : 'Unable to load package documents',
        )
      } finally {
        setDocumentsLoading(false)
      }
    }

    void loadDocuments()
  }, [packageId])

  useEffect(() => {
    const loadInvoice = async () => {
      setInvoiceLoading(true)
      setInvoiceError(null)
      try {
        const response = await fetch(
          `/api/travel-packages/${encodeURIComponent(packageId)}/invoice`,
        )
        const data = (await response.json()) as InvoiceResponse
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Unable to load package invoice')
        }
        if (data.setupRequired) {
          setInvoiceError(data.message || 'Invoice schema is not installed yet')
          setInvoice(null)
          setInvoiceForm(createInitialInvoiceForm())
          return
        }
        setInvoice(data.invoice || null)
        setInvoiceForm(createInitialInvoiceForm(data.invoice || null))
      } catch (loadError) {
        setInvoiceError(
          loadError instanceof Error ? loadError.message : 'Unable to load package invoice',
        )
      } finally {
        setInvoiceLoading(false)
      }
    }

    void loadInvoice()
  }, [packageId])

  const loadPackageGroupDetail = useCallback(
    async (groupId: string) => {
      if (!groupId) return null
      const response = await fetch(`/api/travel-package-groups/${encodeURIComponent(groupId)}`)
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        if (data.setupRequired) {
          setPackageGroupError(data.message || 'Linked package group schema is required')
          return null
        }
        throw new Error(data.error || 'Unable to load linked package group')
      }
      const group = data.group as TravelPackageGroupDetail
      setActivePackageGroup(group)
      setPackageGroupSelectedId(group.id)
      setPackageGroupTitle(group.title)
      const currentMember = group.members.find((member) => member.package_id === packageId)
      setPackageGroupFamilyLabel(currentMember?.family_label || 'Family')
      setPackageGroupTransportNote(
        group.sharedServices.find(
          (service) => service.service_type === 'transport' && service.customer_visible,
        )?.customer_note || '',
      )
      return group
    },
    [packageId],
  )

  const loadPackageGroups = useCallback(async () => {
    setPackageGroupLoading(true)
    setPackageGroupError(null)
    try {
      const [allResponse, linkedResponse] = await Promise.all([
        fetch('/api/travel-package-groups'),
        fetch(`/api/travel-package-groups?packageId=${encodeURIComponent(packageId)}`),
      ])
      const allData = (await allResponse.json()) as PackageGroupsResponse
      if (!allResponse.ok || allData.setupRequired) {
        throw new Error(allData.message || allData.error || 'Unable to load package groups')
      }
      setPackageGroups(allData.groups || [])

      const linkedData = (await linkedResponse.json()) as PackageGroupsResponse
      if (!linkedResponse.ok || linkedData.setupRequired) return
      const linkedGroup = linkedData.groups?.[0]
      if (linkedGroup) {
        await loadPackageGroupDetail(linkedGroup.id)
      } else {
        setActivePackageGroup(null)
        setPackageGroupSelectedId('')
        setPackageGroupTransportNote('')
      }
    } catch (loadError) {
      setPackageGroupError(
        loadError instanceof Error ? loadError.message : 'Unable to load package groups',
      )
    } finally {
      setPackageGroupLoading(false)
    }
  }, [loadPackageGroupDetail, packageId])

  useEffect(() => {
    void loadPackageGroups()
  }, [loadPackageGroups])

  const savePackageGroupTransportNote = async (group: TravelPackageGroupDetail, note: string) => {
    const existingService = group.sharedServices.find(
      (service) => service.service_type === 'transport',
    )
    const response = await fetch(`/api/travel-package-groups/${group.id}/shared-services`, {
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
      message?: string
      setupRequired?: boolean
    }
    if (!response.ok || data.setupRequired) {
      throw new Error(data.message || data.error || 'Unable to save shared transport note')
    }
  }

  const createPackageGroup = async () => {
    if (!packageFolder) return
    setPackageGroupSaving(true)
    setPackageGroupError(null)
    try {
      const response = await fetch('/api/travel-package-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:
            packageGroupTitle.trim() ||
            `${packageFolder.customer_name || packageFolder.package_reference} linked group`,
          leadPackageId: packageFolder.id,
          familyLabel: packageGroupFamilyLabel || 'Family',
          customerVisible: true,
        }),
      })
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        throw new Error(data.message || data.error || 'Unable to create package group')
      }
      const createdGroup = data.group as TravelPackageGroup
      let detail = await loadPackageGroupDetail(createdGroup.id)
      if (detail && packageGroupTransportNote.trim()) {
        await savePackageGroupTransportNote(detail, packageGroupTransportNote)
        detail = await loadPackageGroupDetail(createdGroup.id)
      }
      await loadPackageGroups()
    } catch (saveError) {
      setPackageGroupError(
        saveError instanceof Error ? saveError.message : 'Unable to create package group',
      )
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const linkPackageToGroup = async () => {
    if (!packageFolder || !packageGroupSelectedId) return
    setPackageGroupSaving(true)
    setPackageGroupError(null)
    try {
      const response = await fetch(
        `/api/travel-package-groups/${encodeURIComponent(packageGroupSelectedId)}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageId: packageFolder.id,
            familyLabel: packageGroupFamilyLabel || 'Family',
            customerVisible: true,
          }),
        },
      )
      const data = (await response.json()) as {
        error?: string
        message?: string
        setupRequired?: boolean
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Unable to link package group')
      }
      let detail = await loadPackageGroupDetail(packageGroupSelectedId)
      if (detail && packageGroupTransportNote.trim()) {
        await savePackageGroupTransportNote(detail, packageGroupTransportNote)
        detail = await loadPackageGroupDetail(packageGroupSelectedId)
      }
      await loadPackageGroups()
    } catch (saveError) {
      setPackageGroupError(
        saveError instanceof Error ? saveError.message : 'Unable to link package group',
      )
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const updatePackageGroupTransportNote = async () => {
    if (!activePackageGroup) return
    setPackageGroupSaving(true)
    setPackageGroupError(null)
    try {
      await savePackageGroupTransportNote(activePackageGroup, packageGroupTransportNote)
      await loadPackageGroupDetail(activePackageGroup.id)
    } catch (saveError) {
      setPackageGroupError(
        saveError instanceof Error ? saveError.message : 'Unable to update transport note',
      )
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const unlinkPackageFromGroup = async () => {
    const member = activePackageGroup?.members.find(
      (candidate) => candidate.package_id === packageId,
    )
    if (!activePackageGroup || !member) return
    setPackageGroupSaving(true)
    setPackageGroupError(null)
    try {
      const response = await fetch(
        `/api/travel-package-groups/${encodeURIComponent(
          activePackageGroup.id,
        )}/members?memberId=${encodeURIComponent(member.id)}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as {
        error?: string
        message?: string
        setupRequired?: boolean
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Unable to unlink package group')
      }
      setActivePackageGroup(null)
      setPackageGroupSelectedId('')
      setPackageGroupTransportNote('')
      await loadPackageGroups()
    } catch (saveError) {
      setPackageGroupError(
        saveError instanceof Error ? saveError.message : 'Unable to unlink package group',
      )
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const selectedCombination = normalizeSelectedCombination(
    packageFolder?.selected_quote_snapshot?.selection?.combination,
  )
  const selectedPayload = packageFolder?.selected_quote_snapshot?.payload
  const selectedSelection = packageFolder?.selected_quote_snapshot?.selection
  const selectedQuote = packageFolder?.selected_quote_snapshot?.quote
  const defaultSoldPrice = selectedCombination?.totalPrice || 0
  const passengerSummary = packageFolder?.passenger_summary
  const groupedDocuments = useMemo(() => groupPackageDocumentsByCategory(documents), [documents])
  const documentCountsByCategory = useMemo(() => {
    return documents.reduce(
      (counts, document) => {
        counts[document.category] = (counts[document.category] || 0) + 1
        return counts
      },
      {} as Record<TravelPackageDocumentCategory, number>,
    )
  }, [documents])
  const reservationTitleById = useMemo(
    () => new Map(reservations.map((reservation) => [reservation.id, reservation.title])),
    [reservations],
  )
  const filteredPackageGroups = useMemo(() => {
    const search = packageGroupSearch.trim().toLowerCase()
    if (!search) return packageGroups
    return packageGroups.filter((group) =>
      `${group.group_reference} ${group.title}`.toLowerCase().includes(search),
    )
  }, [packageGroupSearch, packageGroups])
  const visibleDocumentCount = documents.filter(
    (document) => document.customer_visible && document.status === 'released',
  ).length
  const customerAccessLastName =
    packageFolder?.customer_access_last_name ||
    packageFolder?.customer_name?.trim().split(/\s+/).pop()?.toLowerCase() ||
    'lead surname'
  const quoteTitle =
    selectedPayload?.title ||
    selectedQuote?.title ||
    packageFolder?.package_reference ||
    'Final quotation'
  const quoteCustomerName =
    selectedSelection?.selection.customerName ||
    packageFolder?.customer_name ||
    selectedPayload?.customerName ||
    selectedQuote?.customer_name ||
    'No customer name'
  const quoteCustomerPhone =
    selectedSelection?.selection.customerPhone ||
    packageFolder?.customer_phone ||
    selectedPayload?.customerPhone ||
    selectedQuote?.customer_phone ||
    'No phone'
  const quoteCustomerEmail =
    selectedSelection?.selection.customerEmail ||
    packageFolder?.customer_email ||
    selectedPayload?.customerEmail ||
    selectedQuote?.customer_email ||
    'No email'
  const quoteCustomerParts = quoteCustomerName.trim().split(/\s+/).filter(Boolean)
  const quoteCustomerFirstName =
    quoteCustomerParts.length > 1 ? quoteCustomerParts.slice(0, -1).join(' ') : quoteCustomerName
  const quoteCustomerLastName =
    quoteCustomerParts.length > 1
      ? quoteCustomerParts[quoteCustomerParts.length - 1]
      : customerAccessLastName
  const quoteSelectionNote =
    selectedSelection?.selection.note ||
    selectedQuote?.selection_note ||
    selectedPayload?.notes ||
    ''
  const dateRange = useMemo(() => {
    if (!packageFolder) return 'Dates not set'
    return `${formatDate(packageFolder.departure_date)} to ${formatDate(packageFolder.return_date)}`
  }, [packageFolder])
  const quoteDateRange = `${formatDate(
    selectedPayload?.departureDate || packageFolder?.departure_date,
  )} to ${formatDate(selectedPayload?.returnDate || packageFolder?.return_date)}`
  const publicSummaryCurrency =
    typeof packageFolder?.current_public_summary?.currency === 'string'
      ? packageFolder.current_public_summary.currency
      : undefined
  const reservationCurrency = selectedCombination?.currency || publicSummaryCurrency || 'GBP'
  const reservationTotals = useMemo(() => {
    return reservations.reduce(
      (totals, reservation) => {
        totals.booked += Number(reservation.booked_cost_total || 0)
        totals.sold += Number(reservation.sold_price_total || 0)
        totals.discount += Number(reservation.discount_total || 0)
        totals.commission += Number(reservation.commission_expected_total || 0)
        return totals
      },
      { booked: 0, sold: 0, discount: 0, commission: 0 },
    )
  }, [reservations])
  const bookedSoldDifference =
    reservationTotals.sold - reservationTotals.discount - reservationTotals.booked
  const estimatedMargin = bookedSoldDifference + reservationTotals.commission
  const quoteReservationPrefills = useMemo<QuoteReservationPrefill[]>(() => {
    if (!selectedCombination) return []
    const servicePassengers = selectedCombination.servicePassengers
    const prefills: QuoteReservationPrefill[] = []
    if (selectedCombination.flightOption) {
      prefills.push({
        key: `flight-${selectedCombination.flightOption.id}`,
        reservationType: 'flight',
        title: selectedCombination.flightOption.title,
        soldPriceTotal: getOptionSoldTotal(
          selectedCombination.flightOption,
          servicePassengers,
          passengerSummary,
        ),
        internalNotes: getReservationSummary(selectedCombination.flightOption),
      })
    }
    selectedCombination.visaOptions.forEach((option) => {
      const quantity = getVisaQuantity(option, servicePassengers)
      prefills.push({
        key: `visa-${option.id}`,
        reservationType: 'visa',
        title: `${quantity} x ${option.title}`,
        soldPriceTotal: Number(option.price || 0) * quantity,
        internalNotes: getReservationSummary(option),
      })
    })
    if (selectedCombination.transportOption) {
      prefills.push({
        key: `transport-${selectedCombination.transportOption.id}`,
        reservationType: 'transport',
        title: selectedCombination.transportOption.title,
        bookedCostTotal: Number(selectedCombination.transportOption.transportNetCost || 0),
        soldPriceTotal: getOptionSoldTotal(
          selectedCombination.transportOption,
          servicePassengers,
          passengerSummary,
        ),
        internalNotes: getTransportReservationSummary(selectedCombination.transportOption),
      })
    }
    selectedCombination.staySelections.forEach((stay) => {
      prefills.push({
        key: `hotel-${stay.groupId}-${stay.option.id}`,
        reservationType: 'hotel',
        title: `${stay.groupLabel}: ${stay.option.title}`,
        soldPriceTotal: Number(stay.option.price || 0),
        internalNotes: getReservationSummary(stay.option),
      })
    })
    return prefills
  }, [passengerSummary, selectedCombination])
  const invoiceSubtotalSold = parseMoneyInput(invoiceForm.subtotalSold)
  const invoiceDiscountTotal = parseMoneyInput(invoiceForm.discountTotal)
  const invoiceTotalPaid = parseMoneyInput(invoiceForm.totalPaid)
  const invoiceTotalBookedCost = parseMoneyInput(invoiceForm.totalBookedCost)
  const invoiceExpectedCommission = parseMoneyInput(invoiceForm.expectedCommissionTotal)
  const invoiceTotalSold = invoiceSubtotalSold - invoiceDiscountTotal
  const invoiceBalanceDue = invoiceTotalSold - invoiceTotalPaid
  const invoiceProjectedMargin =
    invoiceTotalSold - invoiceTotalBookedCost + invoiceExpectedCommission
  const invoiceCurrency = invoice?.currency || reservationCurrency
  const packageTabs: Array<{
    value: PackageWorkspaceTab
    label: string
    icon: typeof PackageCheck
  }> = [
    { value: 'overview', label: 'Overview', icon: PackageCheck },
    { value: 'documents', label: 'Documents', icon: Upload },
    { value: 'reservations', label: 'Reservations', icon: BadgePoundSterling },
    { value: 'invoice', label: 'Invoice', icon: FileText },
  ]
  const accessVoucherDetailsText = `Dear ${quoteCustomerName},

Your travel documents are now available in your secure client portal. Please use the details below to log in:

Website: ${CUSTOMER_PORTAL_URL}
Reference Number: *${packageFolder?.package_reference || packageId}*
Last Name: *${quoteCustomerLastName}*

Kind regards,
The Piyam Travel Team`

  useEffect(() => {
    let active = true
    QRCode.toDataURL(CUSTOMER_PORTAL_URL, {
      width: 160,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setAccessVoucherQr(url)
      })
      .catch(() => {
        if (active) setAccessVoucherQr('')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const firstPrefill = quoteReservationPrefills[0]
    if (!firstPrefill && defaultSoldPrice <= 0) return
    setReservationForm((current) => {
      if (current.title || current.soldPriceTotal) return current
      if (firstPrefill) {
        return {
          ...current,
          reservationType: firstPrefill.reservationType,
          title: firstPrefill.title,
          bookedCostTotal:
            firstPrefill.bookedCostTotal && firstPrefill.bookedCostTotal > 0
              ? String(firstPrefill.bookedCostTotal)
              : current.bookedCostTotal,
          soldPriceTotal:
            firstPrefill.soldPriceTotal > 0 ? String(firstPrefill.soldPriceTotal) : '',
          internalNotes: firstPrefill.internalNotes,
          paymentDueAt: current.paymentDueAt || toDateTimeLocalValue(),
        }
      }
      return {
        ...current,
        soldPriceTotal: String(defaultSoldPrice),
        paymentDueAt: current.paymentDueAt || toDateTimeLocalValue(),
      }
    })
  }, [defaultSoldPrice, quoteReservationPrefills])

  const updateReservationForm = <Key extends keyof ReservationFormState>(
    key: Key,
    value: ReservationFormState[Key],
  ) => {
    setReservationForm((current) => ({ ...current, [key]: value }))
  }

  const createReservation = async () => {
    if (!packageFolder || savingReservation) return
    setSavingReservation(true)
    setReservationError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteId: packageFolder.source_quote_id,
            reservationType: reservationForm.reservationType,
            title: reservationForm.title,
            status: reservationForm.status,
            supplierName: reservationForm.supplierName,
            supplierReference: reservationForm.supplierReference,
            bookedCostTotal: reservationForm.bookedCostTotal,
            soldPriceTotal: reservationForm.soldPriceTotal,
            discountTotal: reservationForm.discountTotal,
            commissionExpectedTotal: reservationForm.commissionExpectedTotal,
            depositRequired: reservationForm.depositRequired,
            depositAmount: reservationForm.depositAmount,
            paymentDueAt: reservationForm.paymentDueAt,
            internalNotes: reservationForm.internalNotes,
            currency: reservationCurrency,
          }),
        },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || data.error || 'Failed to create reservation')
      }
      const createdReservation = data.reservation
      setReservations((current) => [createdReservation, ...current])
      setItemForms((current) => ({
        ...current,
        [createdReservation.id]: createInitialReservationItemForm(
          createdReservation.reservation_type,
        ),
      }))
      setReservationFinancialForms((current) => ({
        ...current,
        [createdReservation.id]: createReservationFinancialForm(createdReservation),
      }))
      setReservationForm(createInitialReservationForm(defaultSoldPrice))
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to create reservation',
      )
    } finally {
      setSavingReservation(false)
    }
  }

  const applyReservationPrefill = (prefill: QuoteReservationPrefill) => {
    setReservationForm((current) => ({
      ...current,
      reservationType: prefill.reservationType,
      title: prefill.title,
      status: 'reservation_pending',
      soldPriceTotal: prefill.soldPriceTotal > 0 ? String(prefill.soldPriceTotal) : '',
      bookedCostTotal:
        prefill.bookedCostTotal && prefill.bookedCostTotal > 0
          ? String(prefill.bookedCostTotal)
          : '',
      supplierName: '',
      supplierReference: '',
      internalNotes: prefill.internalNotes,
      paymentDueAt: current.paymentDueAt || toDateTimeLocalValue(),
    }))
  }

  const updateReservationStatus = async (
    reservation: TravelPackageReservation,
    status: TravelPackageReservationStatus,
  ) => {
    setUpdatingReservationId(reservation.id)
    setReservationError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations/${encodeURIComponent(
          reservation.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || data.error || 'Failed to update reservation')
      }
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id ? { ...data.reservation!, items: item.items } : item,
        ),
      )
    } catch (updateError) {
      setReservationError(
        updateError instanceof Error ? updateError.message : 'Failed to update reservation',
      )
    } finally {
      setUpdatingReservationId(null)
    }
  }

  const copyAccessVoucherText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setAccessVoucherCopyMessage(message)
      window.setTimeout(() => setAccessVoucherCopyMessage(''), 2500)
    } catch {
      setAccessVoucherCopyMessage('Unable to copy')
    }
  }

  const uploadDocumentFile = async (
    file: File,
    overrides: {
      title?: string
      category: TravelPackageDocumentCategory
      reservationId?: string
      publicNotes?: string
      internalNotes?: string
      customerVisible?: boolean
    },
  ) => {
    if (savingDocument) return
    setSavingDocument(true)
    setDocumentError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', overrides.title || file.name)
      formData.append('category', overrides.category)
      formData.append('reservationId', overrides.reservationId || '')
      formData.append('publicNotes', overrides.publicNotes || '')
      formData.append('internalNotes', overrides.internalNotes || '')
      formData.append('customerVisible', String(Boolean(overrides.customerVisible)))

      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents`,
        {
          method: 'POST',
          body: formData,
        },
      )
      const data = (await response.json()) as DocumentsResponse
      if (!response.ok || !data.document) {
        throw new Error(data.message || data.error || 'Failed to upload package document')
      }

      setDocuments((current) => [data.document!, ...current])
    } catch (uploadError) {
      setDocumentError(
        uploadError instanceof Error ? uploadError.message : 'Failed to upload package document',
      )
    } finally {
      setSavingDocument(false)
      setDraggingDocumentCategory(null)
    }
  }

  const updateDocumentVisibility = async (
    document: TravelPackageDocument,
    customerVisible: boolean,
  ) => {
    setUpdatingDocumentId(document.id)
    setDocumentError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
          document.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerVisible }),
        },
      )
      const data = (await response.json()) as DocumentsResponse
      if (!response.ok || !data.document) {
        throw new Error(data.message || data.error || 'Failed to update package document')
      }
      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? data.document! : item)),
      )
    } catch (updateError) {
      setDocumentError(
        updateError instanceof Error ? updateError.message : 'Failed to update package document',
      )
    } finally {
      setUpdatingDocumentId(null)
    }
  }

  const deleteDocument = async (document: TravelPackageDocument) => {
    setUpdatingDocumentId(document.id)
    setDocumentError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
          document.id,
        )}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as DocumentsResponse
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to delete package document')
      }
      setDocuments((current) => current.filter((item) => item.id !== document.id))
    } catch (deleteError) {
      setDocumentError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete package document',
      )
    } finally {
      setUpdatingDocumentId(null)
    }
  }

  const downloadDocument = async (document: TravelPackageDocument) => {
    setUpdatingDocumentId(document.id)
    setDocumentError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
          document.id,
        )}/signed-url`,
      )
      const data = (await response.json()) as { url?: string; error?: string; message?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.message || data.error || 'Failed to prepare document download')
      }
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (downloadError) {
      setDocumentError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Failed to prepare document download',
      )
    } finally {
      setUpdatingDocumentId(null)
    }
  }

  const updateInvoiceForm = <Key extends keyof InvoiceFormState>(
    key: Key,
    value: InvoiceFormState[Key],
  ) => {
    setInvoiceForm((current) => ({ ...current, [key]: value }))
  }

  const createInvoice = async (regenerate = false) => {
    if (savingInvoice) return
    setSavingInvoice(true)
    setInvoiceError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            regenerate,
            currency: reservationCurrency,
            customerTerms: invoiceForm.customerTerms,
            internalNotes: invoiceForm.internalNotes,
            dueAt: invoiceForm.dueAt,
          }),
        },
      )
      const data = (await response.json()) as InvoiceResponse
      if (!response.ok || !data.invoice) {
        throw new Error(data.message || data.error || 'Failed to create package invoice')
      }
      setInvoice(data.invoice)
      setInvoiceForm(createInitialInvoiceForm(data.invoice))
      setPackageFolder((current) =>
        current
          ? {
              ...current,
              invoice_status: mapInvoiceToPackageInvoiceStatus(data.invoice!),
            }
          : current,
      )
    } catch (createError) {
      setInvoiceError(
        createError instanceof Error ? createError.message : 'Failed to create package invoice',
      )
    } finally {
      setSavingInvoice(false)
    }
  }

  const saveInvoice = async () => {
    if (!invoice || savingInvoice) return
    setSavingInvoice(true)
    setInvoiceError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/invoice`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoice.id,
            status: invoiceForm.status,
            subtotalSold: invoiceForm.subtotalSold,
            discountTotal: invoiceForm.discountTotal,
            totalPaid: invoiceForm.totalPaid,
            totalBookedCost: invoiceForm.totalBookedCost,
            expectedCommissionTotal: invoiceForm.expectedCommissionTotal,
            receivedCommissionTotal: invoiceForm.receivedCommissionTotal,
            releasedToCustomer: invoiceForm.releasedToCustomer,
            customerTerms: invoiceForm.customerTerms,
            internalNotes: invoiceForm.internalNotes,
            dueAt: invoiceForm.dueAt,
            amendmentReason: invoiceForm.amendmentReason,
          }),
        },
      )
      const data = (await response.json()) as InvoiceResponse
      if (!response.ok || !data.invoice) {
        throw new Error(data.message || data.error || 'Failed to save package invoice')
      }
      setInvoice(data.invoice)
      setInvoiceForm(createInitialInvoiceForm(data.invoice))
      setPackageFolder((current) =>
        current
          ? {
              ...current,
              invoice_status: mapInvoiceToPackageInvoiceStatus(data.invoice!),
            }
          : current,
      )
    } catch (saveError) {
      setInvoiceError(
        saveError instanceof Error ? saveError.message : 'Failed to save package invoice',
      )
    } finally {
      setSavingInvoice(false)
    }
  }

  const releaseInvoice = async () => {
    if (!invoice || savingInvoice) return
    setSavingInvoice(true)
    setInvoiceError(null)
    try {
      const saveResponse = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/invoice`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoice.id,
            status: invoiceForm.status === 'amended' ? 'finalised' : invoiceForm.status,
            subtotalSold: invoiceForm.subtotalSold,
            discountTotal: invoiceForm.discountTotal,
            totalPaid: invoiceForm.totalPaid,
            totalBookedCost: invoiceForm.totalBookedCost,
            expectedCommissionTotal: invoiceForm.expectedCommissionTotal,
            receivedCommissionTotal: invoiceForm.receivedCommissionTotal,
            releasedToCustomer: false,
            customerTerms: invoiceForm.customerTerms,
            internalNotes: invoiceForm.internalNotes,
            dueAt: invoiceForm.dueAt,
            amendmentReason: invoiceForm.amendmentReason,
          }),
        },
      )
      const savedData = (await saveResponse.json()) as InvoiceResponse
      if (!saveResponse.ok || !savedData.invoice) {
        throw new Error(
          savedData.message || savedData.error || 'Failed to save invoice before release',
        )
      }
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/invoice/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: savedData.invoice.id,
            changeSummary: invoiceForm.amendmentReason,
          }),
        },
      )
      const data = (await response.json()) as InvoiceResponse
      if (!response.ok || !data.invoice) {
        throw new Error(data.message || data.error || 'Failed to release package invoice')
      }
      setInvoice(data.invoice)
      setInvoiceForm(createInitialInvoiceForm(data.invoice))
      setPackageFolder((current) =>
        current ? { ...current, invoice_status: 'released_to_customer' } : current,
      )
    } catch (releaseError) {
      setInvoiceError(
        releaseError instanceof Error ? releaseError.message : 'Failed to release package invoice',
      )
    } finally {
      setSavingInvoice(false)
    }
  }

  const beginInvoiceAmendment = async () => {
    if (!invoice || savingInvoice) return
    const reason = invoiceForm.amendmentReason.trim()
    if (!reason) {
      setInvoiceError('Enter an amendment reason before reopening a released invoice.')
      return
    }
    setSavingInvoice(true)
    setInvoiceError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/invoice/amend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: invoice.id, reason }),
        },
      )
      const data = (await response.json()) as InvoiceResponse
      if (!response.ok || !data.invoice) {
        throw new Error(data.message || data.error || 'Failed to start invoice amendment')
      }
      const amendedInvoice = { ...data.invoice, lines: invoice.lines || [] }
      setInvoice(amendedInvoice)
      setInvoiceForm(createInitialInvoiceForm(amendedInvoice))
      setPackageFolder((current) => (current ? { ...current, invoice_status: 'amended' } : current))
    } catch (amendError) {
      setInvoiceError(
        amendError instanceof Error ? amendError.message : 'Failed to start amendment',
      )
    } finally {
      setSavingInvoice(false)
    }
  }

  const getReservationFinancialForm = (reservation: TravelPackageReservation) => {
    return reservationFinancialForms[reservation.id] || createReservationFinancialForm(reservation)
  }

  const updateReservationFinancialForm = <Key extends keyof ReservationFinancialFormState>(
    reservation: TravelPackageReservation,
    key: Key,
    value: ReservationFinancialFormState[Key],
  ) => {
    setReservationFinancialForms((current) => ({
      ...current,
      [reservation.id]: {
        ...(current[reservation.id] || createReservationFinancialForm(reservation)),
        [key]: value,
      },
    }))
  }

  const saveReservationFinancials = async (reservation: TravelPackageReservation) => {
    const financialForm = getReservationFinancialForm(reservation)
    setSavingReservationFinancialId(reservation.id)
    setReservationError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations/${encodeURIComponent(
          reservation.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookedCostTotal: financialForm.bookedCostTotal,
            soldPriceTotal: financialForm.soldPriceTotal,
            discountTotal: financialForm.discountTotal,
            commissionExpectedTotal: financialForm.commissionExpectedTotal,
            depositRequired: financialForm.depositRequired,
            depositAmount: financialForm.depositAmount,
            paymentDueAt: financialForm.paymentDueAt,
          }),
        },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || data.error || 'Failed to update reservation financials')
      }
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id ? { ...data.reservation!, items: item.items } : item,
        ),
      )
      setReservationFinancialForms((current) => ({
        ...current,
        [reservation.id]: createReservationFinancialForm(data.reservation!),
      }))
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to update reservation financials',
      )
    } finally {
      setSavingReservationFinancialId(null)
    }
  }

  const getReservationItemForm = (reservation: TravelPackageReservation) => {
    return (
      itemForms[reservation.id] || createInitialReservationItemForm(reservation.reservation_type)
    )
  }

  const updateReservationItemForm = <Key extends keyof ReservationItemFormState>(
    reservation: TravelPackageReservation,
    key: Key,
    value: ReservationItemFormState[Key],
  ) => {
    setItemForms((current) => ({
      ...current,
      [reservation.id]: {
        ...(current[reservation.id] ||
          createInitialReservationItemForm(reservation.reservation_type)),
        [key]: value,
      },
    }))
  }

  const createReservationItem = async (reservation: TravelPackageReservation) => {
    const itemForm = getReservationItemForm(reservation)
    if (!itemForm.title.trim() || savingItemReservationId) return

    setSavingItemReservationId(reservation.id)
    setReservationError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations/${encodeURIComponent(
          reservation.id,
        )}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: itemForm.itemType,
            title: itemForm.title,
            status: itemForm.status,
            quantity: itemForm.quantity,
            unitBookedCost: itemForm.unitBookedCost,
            unitSoldPrice: itemForm.unitSoldPrice,
            discountAmount: itemForm.discountAmount,
            commissionExpectedAmount: itemForm.commissionExpectedAmount,
            supplierReference: itemForm.supplierReference,
            description: itemForm.description,
            currency: reservation.currency || reservationCurrency,
          }),
        },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok || !data.item) {
        throw new Error(data.message || data.error || 'Failed to create reservation item')
      }

      setReservations((current) =>
        current.map((item) => {
          if (item.id !== reservation.id) return item
          const nextItems = [...(item.items || []), data.item!]
          return {
            ...(data.reservation || item),
            items: nextItems,
          }
        }),
      )
      setItemForms((current) => ({
        ...current,
        [reservation.id]: createInitialReservationItemForm(reservation.reservation_type),
      }))
      if (data.reservation) {
        setReservationFinancialForms((current) => ({
          ...current,
          [reservation.id]: createReservationFinancialForm(data.reservation!),
        }))
      }
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to create reservation item',
      )
    } finally {
      setSavingItemReservationId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading package folder</span>
        </div>
      </div>
    )
  }

  if (error || !packageFolder) {
    return (
      <section className="rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-black text-slate-950">Package folder unavailable</p>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          href="/dashboard/packages"
          className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Packages
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link
          href="/dashboard/packages"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Packages
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Package folder</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              {packageFolder.package_reference}
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-700">
              {packageFolder.customer_name || 'No customer'} · {packageFolder.package_type}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Manage the package from final quotation through reservations, payments, released
              documents, travel, return, and final earned closure.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {selectedCombination && (
              <button
                type="button"
                onClick={() => setShowQuoteSnapshot(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              >
                View Final Quotation
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAccessVoucher(true)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1422]"
            >
              Generate Access Voucher
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard icon={PackageCheck} label="Package status" value={packageFolder.status} />
        <StatusCard icon={ShieldCheck} label="Passports" value={packageFolder.passport_status} />
        <StatusCard icon={CreditCard} label="Payment" value={packageFolder.payment_status} />
        <StatusCard icon={FileText} label="Invoice" value={packageFolder.invoice_status} />
      </section>

      <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-900 text-white">
            <Link2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950">Linked package group</h2>
            <p className="text-xs font-semibold text-cyan-900">
              Link family package folders for shared transport without showing internal transport
              cost to customers.
            </p>
          </div>
        </div>
        {packageGroupError && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {packageGroupError}
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-cyan-200 bg-white p-3">
            <p className="text-sm font-black text-slate-950">Create or link group</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">Group name</span>
                <input
                  value={packageGroupTitle}
                  onChange={(event) => setPackageGroupTitle(event.target.value)}
                  placeholder={`${packageFolder.customer_name || packageFolder.package_reference} linked group`}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">
                  This family label
                </span>
                <input
                  value={packageGroupFamilyLabel}
                  onChange={(event) => setPackageGroupFamilyLabel(event.target.value)}
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
                Create Group
              </button>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">Find group</span>
                <input
                  value={packageGroupSearch}
                  onChange={(event) => setPackageGroupSearch(event.target.value)}
                  placeholder="Search by group ref or name"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-cyan-700"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Existing group</span>
                <select
                  value={packageGroupSelectedId}
                  onChange={(event) => setPackageGroupSelectedId(event.target.value)}
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
                onClick={() => void linkPackageToGroup()}
                disabled={packageGroupSaving || !packageGroupSelectedId}
                className="self-end min-h-11 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
              >
                Link Package
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200 bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950">
                  {activePackageGroup
                    ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                    : 'No linked group active'}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Customer output uses note-only wording. Internal allocation stays private.
                </p>
              </div>
              {activePackageGroup && (
                <button
                  type="button"
                  onClick={() => void unlinkPackageFromGroup()}
                  disabled={packageGroupSaving}
                  className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Unlink
                </button>
              )}
            </div>
            {activePackageGroup && activePackageGroup.members.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {activePackageGroup.members.map((member) => (
                  <span
                    key={member.id}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${
                      member.package_id === packageId
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
                value={packageGroupTransportNote}
                onChange={(event) => setPackageGroupTransportNote(event.target.value)}
                placeholder="Transport is shared with Family Hussain / PT-ABC123."
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-700"
              />
            </label>
            <button
              type="button"
              onClick={() => void updatePackageGroupTransportNote()}
              disabled={packageGroupSaving || !activePackageGroup}
              className="mt-3 min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
            >
              Save Transport Note
            </button>
          </div>
        </div>
      </section>

      <nav
        aria-label="Package workspace"
        className="sticky top-0 z-20 -mx-1 overflow-x-auto border-y border-slate-200 bg-slate-50/95 px-1 py-2 backdrop-blur"
      >
        <div className="flex min-w-max gap-2">
          {packageTabs.map(({ value, label: navLabel, icon: Icon }) => {
            const active = activePackageTab === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActivePackageTab(value)}
                className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black shadow-sm transition ${
                  active
                    ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#8b1e2d]/30 hover:text-[#8b1e2d]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {navLabel}
              </button>
            )
          })}
        </div>
      </nav>

      <section
        className={
          activePackageTab === 'overview'
            ? 'space-y-5'
            : 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]'
        }
      >
        <div className="space-y-5">
          {activePackageTab === 'overview' && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-black text-slate-950">Next action</h2>
                </div>
                <p className="text-base font-black text-[#8b1e2d]">
                  {packageFolder.next_action || 'No next action set'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  First operational step after quote conversion. For most packages this starts with
                  passport copies received via WhatsApp, then deposit/payment handling.
                </p>
              </div>
              <div className="h-2 rounded-full bg-[#8b1e2d]" aria-hidden="true" />
              <section id="package-control" className="scroll-mt-20">
                <PackageOperationsWorkspace
                  packageFolder={packageFolder}
                  invoice={invoice}
                  onPackageChange={setPackageFolder}
                  onInvoiceChange={(updatedInvoice) => {
                    setInvoice(updatedInvoice)
                    setInvoiceForm(createInitialInvoiceForm(updatedInvoice))
                  }}
                />
              </section>
            </>
          )}

          {activePackageTab === 'documents' && (
            <div
              id="package-documents"
              className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <Upload className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-black text-slate-950">Documents</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Upload flight tickets, hotel vouchers, visa files, transport vouchers, and other
                    final customer documents. Only released files appear in the customer portal.
                  </p>
                </div>
                {documentsLoading && (
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading documents
                  </span>
                )}
              </div>

              {documentError && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                  {documentError}
                </div>
              )}

              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Total documents</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{documents.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Released to customer</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{visibleDocumentCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Customer access</p>
                  <p className="mt-1 text-sm font-black text-slate-950">Bookings portal</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Use PT reference and lead surname
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-slate-500">Customer portal</p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      bookings.piyamtravel.com
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      No unique customer link is generated from this page.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Reference</p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      {packageFolder.package_reference}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Lead surname</p>
                    <p className="mt-1 text-sm font-black capitalize text-slate-950">
                      {customerAccessLastName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {PACKAGE_DOCUMENT_CATEGORIES.map((category) => {
                  const activeDrop = draggingDocumentCategory === category.value
                  return (
                    <label
                      key={category.value}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDraggingDocumentCategory(category.value)
                      }}
                      onDragLeave={() => setDraggingDocumentCategory(null)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDraggingDocumentCategory(null)
                        const file = event.dataTransfer.files?.[0]
                        if (file) {
                          void uploadDocumentFile(file, {
                            category: category.value,
                            title: file.name,
                          })
                        }
                      }}
                      className={`flex min-h-32 cursor-pointer flex-col justify-between rounded-lg border-2 border-dashed p-4 transition ${
                        activeDrop
                          ? 'border-[#8b1e2d] bg-red-50'
                          : 'border-slate-300 bg-white hover:border-[#8b1e2d]/50 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        className="sr-only"
                        disabled={savingDocument}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.currentTarget.value = ''
                          if (file) {
                            void uploadDocumentFile(file, {
                              category: category.value,
                              title: file.name,
                            })
                          }
                        }}
                      />
                      <span className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block text-sm font-black text-slate-950">
                            {category.label}
                          </span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {documentCountsByCategory[category.value] || 0} uploaded
                          </span>
                        </span>
                        <Upload className="h-5 w-5 text-[#8b1e2d]" />
                      </span>
                      <span className="mt-3 text-xs font-semibold text-slate-500">
                        Drop file here or click to upload instantly
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="mt-4 space-y-3">
                {documents.length === 0 && !documentsLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                    No package documents uploaded yet.
                  </div>
                ) : (
                  groupedDocuments.map((group) => (
                    <div key={group.value} className="rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-black text-slate-950">{group.label}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                          {group.documents.length}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {group.documents.map((document) => {
                          const updatingThisDocument = updatingDocumentId === document.id
                          const documentIsReleased =
                            document.customer_visible && document.status === 'released'
                          return (
                            <div
                              key={document.id}
                              className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-black text-slate-950">
                                    {document.title}
                                  </p>
                                  <span
                                    className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                                      documentIsReleased
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {documentIsReleased ? 'Released' : 'Internal'}
                                  </span>
                                </div>
                                <p className="mt-1 break-all text-xs font-bold text-slate-500">
                                  {document.file_name} · {formatFileSize(document.file_size)}
                                </p>
                                {document.reservation_id && (
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    Linked to{' '}
                                    {reservationTitleById.get(document.reservation_id) ||
                                      'reservation'}
                                  </p>
                                )}
                                {document.public_notes && (
                                  <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">
                                    {document.public_notes}
                                  </p>
                                )}
                                {document.internal_notes && (
                                  <p className="mt-2 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                    {document.internal_notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void downloadDocument(document)
                                  }}
                                  disabled={updatingThisDocument}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                >
                                  {updatingThisDocument ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  Open
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void updateDocumentVisibility(document, !documentIsReleased)
                                  }}
                                  disabled={updatingThisDocument}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                >
                                  {documentIsReleased ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                  {documentIsReleased ? 'Hide' : 'Release'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteDocument(document)
                                  }}
                                  disabled={updatingThisDocument}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activePackageTab === 'overview' && (
            <>
              <div className="my-6 h-2 rounded-full bg-[#8b1e2d]" aria-hidden="true" />
              <div
                id="final-quote"
                className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-black text-slate-950">Final quote snapshot</h2>
                </div>
                {selectedCombination ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Selected quote</p>
                        <p className="mt-1 text-base font-black text-slate-950">{quoteTitle}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {quoteCustomerName} · {quoteDateRange}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuoteSnapshot(true)}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4" />
                        Open Snapshot
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {quoteCustomerName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{quoteCustomerPhone}</p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {quoteCustomerEmail}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Passengers</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {passengerSummary?.totalPassengers ??
                            selectedCombination.servicePassengers}{' '}
                          total
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {passengerSummary?.adults ?? selectedPayload?.adults ?? 0} adults ·{' '}
                          {passengerSummary?.childrenPaying ?? selectedPayload?.childrenPaying ?? 0}{' '}
                          children 5+ ·{' '}
                          {passengerSummary?.childrenFree ?? selectedPayload?.childrenFree ?? 0}{' '}
                          children 2-5 ·{' '}
                          {passengerSummary?.infants ?? selectedPayload?.infants ?? 0} infants under
                          2
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Sold total</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {formatMoney(
                            selectedCombination.totalPrice,
                            selectedCombination.currency,
                          )}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {formatPaymentMethod(selectedCombination.paymentMethod)}
                          {selectedCombination.paymentSurchargeTotal > 0
                            ? ` · ${formatMoney(
                                selectedCombination.paymentSurchargeTotal,
                                selectedCombination.currency,
                              )} processing fee`
                            : ''}
                        </p>
                        <p className="mt-1 text-xs font-bold text-[#8b1e2d]">
                          {formatMoney(
                            selectedCombination.perPersonPrice,
                            selectedCombination.currency,
                          )}{' '}
                          avg hotel payer
                        </p>
                      </div>
                    </div>

                    {selectedCombination.offerDiscountTotal > 0 && (
                      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                        Discount applied:{' '}
                        {formatMoney(
                          selectedCombination.offerDiscountTotal,
                          selectedCombination.currency,
                        )}
                      </p>
                    )}

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {selectedCombination.flightOption && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">Flight</p>
                          <p className="mt-1 text-sm font-black text-slate-950">
                            {selectedCombination.flightOption.title}
                          </p>
                          {selectedCombination.flightOption.summary && (
                            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                              {selectedCombination.flightOption.summary}
                            </p>
                          )}
                        </div>
                      )}
                      {selectedCombination.visaOptions.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">Visa</p>
                          <div className="mt-1 space-y-2">
                            {selectedCombination.visaOptions.map((option) => (
                              <div key={option.id}>
                                <p className="text-sm font-black text-slate-950">
                                  {getVisaQuantity(option, selectedCombination.servicePassengers)} x{' '}
                                  {option.title}
                                </p>
                                {option.summary && (
                                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                                    {option.summary}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedCombination.transportOption && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">Transport</p>
                          <p className="mt-1 text-sm font-black text-slate-950">
                            {selectedCombination.transportOption.title}
                          </p>
                          {selectedCombination.transportOption.summary && (
                            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                              {selectedCombination.transportOption.summary}
                            </p>
                          )}
                        </div>
                      )}
                      {selectedCombination.staySelections.map((stay) => (
                        <div
                          key={stay.groupId}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <p className="text-xs font-bold uppercase text-slate-500">
                            {stay.groupLabel}
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-950">
                            {stay.option.title}
                          </p>
                          {stay.option.summary && (
                            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                              {stay.option.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {quoteSelectionNote && (
                      <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                        <span className="font-black text-slate-800">Selection note:</span>{' '}
                        {quoteSelectionNote}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No selected quote snapshot found.</p>
                )}
              </div>
            </>
          )}

          {activePackageTab === 'reservations' && (
            <div
              id="package-reservations"
              className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <BadgePoundSterling className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-black text-slate-950">Reservations</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Internal booking records for flights, hotels, visas, and transport. These are
                    not shown to customers unless a later customer release step makes them visible.
                  </p>
                </div>
                {reservationsLoading && (
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading reservations
                  </span>
                )}
              </div>

              {reservationError && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                  {reservationError}
                </div>
              )}

              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Booked cost</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.booked, reservationCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Sold price</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.sold, reservationCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Commission due</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.commission, reservationCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Sold - booked</p>
                  <p className="mt-1 text-sm font-black text-[#8b1e2d]">
                    {formatMoney(bookedSoldDifference, reservationCurrency)}
                  </p>
                  {reservationTotals.commission > 0 && (
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      With commission: {formatMoney(estimatedMargin, reservationCurrency)}
                    </p>
                  )}
                </div>
              </div>

              {quoteReservationPrefills.length > 0 && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        Final quote reservation source
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Use these to create or correct reservation records. Supplier references,
                        booked costs, and confirmation status remain agent-controlled.
                      </p>
                    </div>
                    <span className="text-xs font-black uppercase text-slate-500">
                      {quoteReservationPrefills.length} items
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {quoteReservationPrefills.map((prefill) => (
                      <button
                        key={prefill.key}
                        type="button"
                        onClick={() => applyReservationPrefill(prefill)}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-[#8b1e2d]/40 hover:bg-red-50"
                      >
                        <span className="text-[11px] font-black uppercase text-[#8b1e2d]">
                          {prefill.reservationType}
                        </span>
                        <span className="mt-1 block text-sm font-black text-slate-950">
                          {prefill.title}
                        </span>
                        <span className="mt-1 block text-xs font-bold text-slate-500">
                          Sold from quote:{' '}
                          {formatMoney(prefill.soldPriceTotal, reservationCurrency)}
                        </span>
                        {prefill.bookedCostTotal && prefill.bookedCostTotal > 0 && (
                          <span className="mt-1 block text-xs font-bold text-emerald-700">
                            Net from pricing:{' '}
                            {formatMoney(prefill.bookedCostTotal, reservationCurrency)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void createReservation()
                }}
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Type
                    <select
                      value={reservationForm.reservationType}
                      onChange={(event) =>
                        updateReservationForm(
                          'reservationType',
                          event.target.value as TravelPackageReservationType,
                        )
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                    >
                      {reservationTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                    Reservation title
                    <input
                      value={reservationForm.title}
                      onChange={(event) => updateReservationForm('title', event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      placeholder="Etihad flights, Swissotel Makkah, GB ETA visas"
                      required
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Status
                    <select
                      value={reservationForm.status}
                      onChange={(event) =>
                        updateReservationForm(
                          'status',
                          event.target.value as TravelPackageReservationStatus,
                        )
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                    >
                      {reservationStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Supplier
                    <input
                      value={reservationForm.supplierName}
                      onChange={(event) =>
                        updateReservationForm('supplierName', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      placeholder="Airline, hotel, visa provider"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Supplier ref
                    <input
                      value={reservationForm.supplierReference}
                      onChange={(event) =>
                        updateReservationForm('supplierReference', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      placeholder="PNR or booking ref"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Booked cost
                    <input
                      value={reservationForm.bookedCostTotal}
                      onChange={(event) =>
                        updateReservationForm('bookedCostTotal', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Sold price
                    <input
                      value={reservationForm.soldPriceTotal}
                      onChange={(event) =>
                        updateReservationForm('soldPriceTotal', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Discount
                    <input
                      value={reservationForm.discountTotal}
                      onChange={(event) =>
                        updateReservationForm('discountTotal', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Commission due
                    <input
                      value={reservationForm.commissionExpectedTotal}
                      onChange={(event) =>
                        updateReservationForm('commissionExpectedTotal', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>

                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                    <input
                      checked={reservationForm.depositRequired}
                      onChange={(event) =>
                        updateReservationForm('depositRequired', event.target.checked)
                      }
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d]"
                    />
                    Deposit required
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Deposit amount
                    <input
                      value={reservationForm.depositAmount}
                      onChange={(event) =>
                        updateReservationForm('depositAmount', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase text-slate-500">
                    Payment due
                    <input
                      value={reservationForm.paymentDueAt}
                      onChange={(event) =>
                        updateReservationForm('paymentDueAt', event.target.value)
                      }
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      type="datetime-local"
                    />
                  </label>
                </div>

                <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
                  Internal notes
                  <textarea
                    value={reservationForm.internalNotes}
                    onChange={(event) => updateReservationForm('internalNotes', event.target.value)}
                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                    placeholder="Supplier conditions, amendment notes, deposit details"
                  />
                </label>

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={!reservationForm.title.trim() || savingReservation}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingReservation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Reservation
                  </button>
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {reservations.length === 0 && !reservationsLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm font-bold text-slate-500">
                    No reservations added yet.
                  </div>
                ) : (
                  reservations.map((reservation) => {
                    const ReservationIcon = getReservationIcon(reservation.reservation_type)
                    const itemForm = getReservationItemForm(reservation)
                    const savingThisItem = savingItemReservationId === reservation.id
                    const financialForm = getReservationFinancialForm(reservation)
                    const savingFinancials = savingReservationFinancialId === reservation.id
                    const expanded = Boolean(expandedReservationIds[reservation.id])
                    const netSold =
                      parseMoneyInput(financialForm.soldPriceTotal) -
                      parseMoneyInput(financialForm.discountTotal)
                    const reservationDifference =
                      netSold - parseMoneyInput(financialForm.bookedCostTotal)
                    const reservationWithCommission =
                      reservationDifference + parseMoneyInput(financialForm.commissionExpectedTotal)
                    return (
                      <div
                        key={reservation.id}
                        className="rounded-lg border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 flex-1 gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReservationIds((current) => ({
                                  ...current,
                                  [reservation.id]: !expanded,
                                }))
                              }
                              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                              aria-label={expanded ? 'Collapse reservation' : 'Expand reservation'}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                              <ReservationIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-950">
                                {reservation.title}
                              </p>
                              <p className="mt-1 text-xs font-bold capitalize text-slate-500">
                                {reservation.reservation_type}
                                {reservation.supplier_name ? ` · ${reservation.supplier_name}` : ''}
                              </p>
                              {reservation.supplier_reference && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Ref: {reservation.supplier_reference}
                                </p>
                              )}
                              <p className="mt-2 text-xs font-bold text-slate-500">
                                Sold{' '}
                                {formatMoney(reservation.sold_price_total, reservation.currency)} ·
                                Booked{' '}
                                {formatMoney(reservation.booked_cost_total, reservation.currency)}
                              </p>
                            </div>
                          </div>

                          <select
                            value={reservation.status}
                            disabled={updatingReservationId === reservation.id}
                            onChange={(event) =>
                              void updateReservationStatus(
                                reservation,
                                event.target.value as TravelPackageReservationStatus,
                              )
                            }
                            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold capitalize text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20 disabled:bg-slate-100"
                          >
                            {reservationStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {expanded && (
                          <>
                            <form
                              className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void saveReservationFinancials(reservation)
                              }}
                            >
                              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">
                                    Reservation pricing
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    Difference:{' '}
                                    <span className="text-[#8b1e2d]">
                                      {formatMoney(reservationDifference, reservation.currency)}
                                    </span>{' '}
                                    sold minus discount and booked cost
                                  </p>
                                  {parseMoneyInput(financialForm.commissionExpectedTotal) > 0 && (
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                      With commission:{' '}
                                      {formatMoney(reservationWithCommission, reservation.currency)}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="submit"
                                  disabled={savingFinancials}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {savingFinancials ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  Save Pricing
                                </button>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Booked cost
                                  <input
                                    value={financialForm.bookedCostTotal}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'bookedCostTotal',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Sold price
                                  <input
                                    value={financialForm.soldPriceTotal}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'soldPriceTotal',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Discount
                                  <input
                                    value={financialForm.discountTotal}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'discountTotal',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Commission due
                                  <input
                                    value={financialForm.commissionExpectedTotal}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'commissionExpectedTotal',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                  />
                                </label>

                                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                                  <input
                                    checked={financialForm.depositRequired}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'depositRequired',
                                        event.target.checked,
                                      )
                                    }
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d]"
                                  />
                                  Deposit required
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Deposit amount
                                  <input
                                    value={financialForm.depositAmount}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'depositAmount',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Payment due
                                  <input
                                    value={financialForm.paymentDueAt}
                                    onChange={(event) =>
                                      updateReservationFinancialForm(
                                        reservation,
                                        'paymentDueAt',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    type="datetime-local"
                                  />
                                </label>
                              </div>
                            </form>

                            {reservation.internal_notes && (
                              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                {reservation.internal_notes}
                              </p>
                            )}

                            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-xs font-black uppercase text-slate-500">
                                  Line items
                                </p>
                                <p className="text-xs font-bold text-slate-400">
                                  {(reservation.items || []).length} saved
                                </p>
                              </div>

                              {(reservation.items || []).length > 0 && (
                                <div className="mb-3 space-y-2">
                                  {(reservation.items || []).map((lineItem) => (
                                    <div
                                      key={lineItem.id}
                                      className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]"
                                    >
                                      <div>
                                        <p className="font-black text-slate-950">
                                          {lineItem.title}
                                        </p>
                                        <p className="mt-1 capitalize text-slate-500">
                                          {lineItem.item_type} · {lineItem.status}
                                        </p>
                                        {lineItem.supplier_reference && (
                                          <p className="mt-1 text-slate-500">
                                            Ref: {lineItem.supplier_reference}
                                          </p>
                                        )}
                                      </div>
                                      <div>
                                        <p className="font-bold uppercase text-slate-400">Qty</p>
                                        <p className="font-black text-slate-800">
                                          {lineItem.quantity}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="font-bold uppercase text-slate-400">Booked</p>
                                        <p className="font-black text-slate-800">
                                          {formatMoney(
                                            lineItem.total_booked_cost,
                                            lineItem.currency,
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="font-bold uppercase text-slate-400">Sold</p>
                                        <p className="font-black text-slate-800">
                                          {formatMoney(
                                            lineItem.total_sold_price,
                                            lineItem.currency,
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="font-bold uppercase text-slate-400">
                                          Commission
                                        </p>
                                        <p className="font-black text-slate-800">
                                          {formatMoney(
                                            lineItem.commission_expected_amount,
                                            lineItem.currency,
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <form
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  void createReservationItem(reservation)
                                }}
                              >
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Item
                                    <select
                                      value={itemForm.itemType}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'itemType',
                                          event.target.value as TravelPackageReservationItemType,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    >
                                      {reservationItemTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                                    Title
                                    <input
                                      value={itemForm.title}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'title',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      placeholder="Room, flight sector, visa, transfer"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Qty
                                    <input
                                      value={itemForm.quantity}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'quantity',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      inputMode="decimal"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Status
                                    <select
                                      value={itemForm.status}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'status',
                                          event.target.value as TravelPackageReservationItemStatus,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    >
                                      {reservationItemStatusOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Supplier ref
                                    <input
                                      value={itemForm.supplierReference}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'supplierReference',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      placeholder="Optional"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Unit booked
                                    <input
                                      value={itemForm.unitBookedCost}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'unitBookedCost',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Unit sold
                                    <input
                                      value={itemForm.unitSoldPrice}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'unitSoldPrice',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Discount
                                    <input
                                      value={itemForm.discountAmount}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'discountAmount',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Commission
                                    <input
                                      value={itemForm.commissionExpectedAmount}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'commissionExpectedAmount',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                    />
                                  </label>

                                  <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                                    Notes
                                    <input
                                      value={itemForm.description}
                                      onChange={(event) =>
                                        updateReservationItemForm(
                                          reservation,
                                          'description',
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                      placeholder="Room basis, baggage, transfer route"
                                    />
                                  </label>
                                </div>

                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="submit"
                                    disabled={!itemForm.title.trim() || savingThisItem}
                                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                  >
                                    {savingThisItem ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                    Add Line Item
                                  </button>
                                </div>
                              </form>
                            </div>

                            <p className="mt-3 text-xs font-bold capitalize text-slate-400">
                              Status: {formatReservationStatus(reservation.status)}
                            </p>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {activePackageTab === 'invoice' && (
            <div
              id="package-invoice"
              className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <FileText className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-black text-slate-950">Internal Invoice</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Editable agent invoice workspace. Supplier costs, commission, discounts, and
                    margin stay internal until an agent explicitly releases the invoice later.
                  </p>
                </div>
                {invoiceLoading && (
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading invoice
                  </span>
                )}
              </div>

              {invoiceError && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                  {invoiceError}
                </div>
              )}

              {!invoice ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm font-black text-slate-950">No invoice workspace yet</p>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    Create a draft invoice from the current reservation pricing. It can still be
                    edited as booking costs, commission, discounts, and payments change.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void createInvoice()
                    }}
                    disabled={savingInvoice || invoiceLoading}
                    className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1824] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingInvoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create Invoice
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveInvoice()
                  }}
                >
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Invoice</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {invoice.invoice_number}
                      </p>
                      <p className="mt-1 text-xs font-bold capitalize text-slate-500">
                        {invoice.status.replace(/_/g, ' ')} · v{invoice.version}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Total sold</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {formatMoney(invoiceTotalSold, invoiceCurrency)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Before discount: {formatMoney(invoiceSubtotalSold, invoiceCurrency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Balance due</p>
                      <p className="mt-1 text-sm font-black text-[#8b1e2d]">
                        {formatMoney(invoiceBalanceDue, invoiceCurrency)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Paid: {formatMoney(invoiceTotalPaid, invoiceCurrency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Booked cost</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {formatMoney(invoiceTotalBookedCost, invoiceCurrency)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Discount: {formatMoney(invoiceDiscountTotal, invoiceCurrency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Projected margin</p>
                      <p className="mt-1 text-sm font-black text-emerald-700">
                        {formatMoney(invoiceProjectedMargin, invoiceCurrency)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Includes {formatMoney(invoiceExpectedCommission, invoiceCurrency)}{' '}
                        commission
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-bold uppercase text-slate-500">
                      Status
                      <select
                        value={invoiceForm.status}
                        onChange={(event) =>
                          updateInvoiceForm(
                            'status',
                            event.target.value as TravelPackageInvoiceStatus,
                          )
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      >
                        {invoiceStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Subtotal sold
                      <input
                        value={invoiceForm.subtotalSold}
                        onChange={(event) => updateInvoiceForm('subtotalSold', event.target.value)}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Discount
                      <input
                        value={invoiceForm.discountTotal}
                        onChange={(event) => updateInvoiceForm('discountTotal', event.target.value)}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Total paid
                      <input
                        value={invoiceForm.totalPaid}
                        onChange={(event) => updateInvoiceForm('totalPaid', event.target.value)}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Booked cost
                      <input
                        value={invoiceForm.totalBookedCost}
                        onChange={(event) =>
                          updateInvoiceForm('totalBookedCost', event.target.value)
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Commission expected
                      <input
                        value={invoiceForm.expectedCommissionTotal}
                        onChange={(event) =>
                          updateInvoiceForm('expectedCommissionTotal', event.target.value)
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Commission received
                      <input
                        value={invoiceForm.receivedCommissionTotal}
                        onChange={(event) =>
                          updateInvoiceForm('receivedCommissionTotal', event.target.value)
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500">
                      Payment due
                      <input
                        type="datetime-local"
                        value={invoiceForm.dueAt}
                        onChange={(event) => updateInvoiceForm('dueAt', event.target.value)}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                      Customer terms
                      <textarea
                        value={invoiceForm.customerTerms}
                        onChange={(event) => updateInvoiceForm('customerTerms', event.target.value)}
                        className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        placeholder="Customer-facing terms when invoice release is implemented"
                      />
                    </label>

                    <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                      Internal notes
                      <textarea
                        value={invoiceForm.internalNotes}
                        onChange={(event) => updateInvoiceForm('internalNotes', event.target.value)}
                        className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                        placeholder="Agent-only notes, supplier cost changes, commission follow-up"
                      />
                    </label>

                    {(invoice.released_to_customer || invoice.status === 'amended') && (
                      <label className="text-xs font-bold uppercase text-slate-500 xl:col-span-2">
                        Amendment / release summary
                        <input
                          value={invoiceForm.amendmentReason}
                          onChange={(event) =>
                            updateInvoiceForm('amendmentReason', event.target.value)
                          }
                          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                          placeholder="Explain what changed for the audit history"
                        />
                      </label>
                    )}
                  </div>

                  {(invoice.lines || []).length > 0 && (
                    <div className="mt-4 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-black text-slate-950">Invoice lines</p>
                        <span className="text-xs font-bold text-slate-500">
                          {(invoice.lines || []).length} from reservations
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(invoice.lines || []).map((line) => (
                          <div
                            key={line.id}
                            className="grid gap-2 px-4 py-3 text-xs text-slate-600 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]"
                          >
                            <div>
                              <p className="font-black text-slate-950">{line.description}</p>
                              <p className="mt-1 capitalize text-slate-500">{line.line_type}</p>
                            </div>
                            <div>
                              <p className="font-bold uppercase text-slate-400">Sold</p>
                              <p className="font-black text-slate-800">
                                {formatMoney(line.total_sold_price, invoiceCurrency)}
                              </p>
                            </div>
                            <div>
                              <p className="font-bold uppercase text-slate-400">Booked</p>
                              <p className="font-black text-slate-800">
                                {formatMoney(line.total_booked_cost, invoiceCurrency)}
                              </p>
                            </div>
                            <div>
                              <p className="font-bold uppercase text-slate-400">Discount</p>
                              <p className="font-black text-slate-800">
                                {formatMoney(line.discount_amount, invoiceCurrency)}
                              </p>
                            </div>
                            <div>
                              <p className="font-bold uppercase text-slate-400">Commission</p>
                              <p className="font-black text-slate-800">
                                {formatMoney(line.expected_commission, invoiceCurrency)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <PackageInvoiceLinesEditor
                    packageId={packageId}
                    invoice={invoice}
                    disabled={invoice.released_to_customer}
                    onInvoiceChange={(updatedInvoice) => {
                      setInvoice(updatedInvoice)
                      setInvoiceForm(createInitialInvoiceForm(updatedInvoice))
                    }}
                  />

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {invoice.released_to_customer ? (
                      <button
                        type="button"
                        onClick={() => void beginInvoiceAmendment()}
                        disabled={savingInvoice || !invoiceForm.amendmentReason.trim()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Pencil className="h-4 w-4" />
                        Start Amendment
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void releaseInvoice()}
                        disabled={savingInvoice || invoice.total_sold <= 0}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1824] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Eye className="h-4 w-4" />
                        Release to Customer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void createInvoice(true)
                      }}
                      disabled={savingInvoice}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {savingInvoice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                      New Draft From Reservations
                    </button>
                    <button
                      type="submit"
                      disabled={savingInvoice || invoice.released_to_customer}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingInvoice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Save Invoice
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {activePackageTab !== 'overview' && (
          <aside className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#8b1e2d]" />
                <h2 className="text-base font-black text-slate-950">Travel dates</h2>
              </div>
              <p className="text-sm font-bold text-slate-700">{dateRange}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-[#8b1e2d]" />
                <h2 className="text-base font-black text-slate-950">Passengers</h2>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  Adults: <span className="font-black">{passengerSummary?.adults ?? 0}</span>
                </p>
                <p>
                  Children 5+:{' '}
                  <span className="font-black">{passengerSummary?.childrenPaying ?? 0}</span>
                </p>
                <p>
                  Children 2-5:{' '}
                  <span className="font-black">{passengerSummary?.childrenFree ?? 0}</span>
                </p>
                <p>
                  Infants under 2:{' '}
                  <span className="font-black">{passengerSummary?.infants ?? 0}</span>
                </p>
                <p className="border-t border-slate-100 pt-2 text-xs font-bold text-slate-500">
                  Hotel-paying guests: {passengerSummary?.hotelPayingGuests ?? 0}
                </p>
                <p className="text-xs font-bold text-slate-500">
                  Service passengers: {passengerSummary?.servicePassengers ?? 0}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500">Storage folder</p>
              <p className="mt-2 break-all text-sm font-bold text-slate-700">
                {packageFolder.minio_bucket || 'pt-packages'} / {packageFolder.minio_prefix || ''}
              </p>
            </div>
          </aside>
        )}
      </section>

      {showAccessVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowAccessVoucher(false)}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-800"
              aria-label="Close access voucher"
            >
              <X className="h-6 w-6" />
            </button>
            <h2 className="text-2xl font-black text-slate-950">Share Customer Access</h2>
            <p className="mt-2 text-sm text-slate-500">
              Share these details with your customer to access their portal.
            </p>

            <div className="mt-6 grid gap-5 rounded-lg border border-slate-200 bg-slate-50 p-6 md:grid-cols-[1fr_1.35fr_1fr] md:items-center">
              <div className="flex items-center justify-center md:border-r md:border-slate-200 md:pr-6">
                <Image
                  src="/logo.png"
                  alt="Piyam Travel Logo"
                  width={128}
                  height={64}
                  className="h-auto w-32 object-contain"
                />
              </div>

              <div className="text-center md:border-r md:border-slate-200 md:px-6">
                <p className="text-sm text-slate-500">Customer</p>
                <p className="text-xl font-black text-slate-950">
                  {quoteCustomerFirstName} {quoteCustomerLastName}
                </p>
                <p className="mt-4 text-sm text-slate-500">Reference Number</p>
                <p className="inline-block rounded-md border border-red-200 bg-red-50 px-2 py-1 font-mono text-xl text-[#8b1e2d]">
                  {packageFolder.package_reference}
                </p>
                <p className="mt-4 text-sm text-slate-500">Login Website</p>
                <p className="text-lg font-black text-slate-950">
                  {CUSTOMER_PORTAL_URL.replace('https://', '')}
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="rounded-md border bg-white p-2 shadow-sm">
                  {accessVoucherQr ? (
                    <Image
                      src={accessVoucherQr}
                      alt="Customer portal QR code"
                      width={128}
                      height={128}
                      unoptimized
                      className="h-32 w-32"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center text-xs font-bold text-slate-500">
                      QR loading
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void copyAccessVoucherText(CUSTOMER_PORTAL_URL, 'Link copied')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 text-sm font-black text-slate-800 transition hover:bg-slate-300"
              >
                <Link2 className="h-5 w-5" />
                Copy Link
              </button>
              <button
                type="button"
                onClick={() =>
                  void copyAccessVoucherText(accessVoucherDetailsText, 'Details copied')
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#a1171d] px-4 text-sm font-black text-white shadow-md transition hover:bg-[#861116]"
              >
                <Copy className="h-5 w-5" />
                Copy Details as Text
              </button>
            </div>

            {accessVoucherCopyMessage && (
              <p className="mt-4 text-center text-sm font-black text-emerald-600">
                {accessVoucherCopyMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {showQuoteSnapshot && selectedCombination && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="my-8 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Final quotation</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{quoteTitle}</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {packageFolder.package_reference} · {quoteDateRange}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuoteSnapshot(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Close final quotation snapshot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{quoteCustomerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{quoteCustomerPhone}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{quoteCustomerEmail}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Passengers</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {passengerSummary?.totalPassengers ?? selectedCombination.servicePassengers}{' '}
                    total
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {passengerSummary?.adults ?? selectedPayload?.adults ?? 0} adults ·{' '}
                    {passengerSummary?.childrenPaying ?? selectedPayload?.childrenPaying ?? 0}{' '}
                    children 5+ ·{' '}
                    {passengerSummary?.childrenFree ?? selectedPayload?.childrenFree ?? 0} children
                    2-5 · {passengerSummary?.infants ?? selectedPayload?.infants ?? 0} infants under
                    2
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Final sold total</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(selectedCombination.totalPrice, selectedCombination.currency)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatPaymentMethod(selectedCombination.paymentMethod)}
                    {selectedCombination.paymentSurchargeTotal > 0
                      ? ` · ${formatMoney(
                          selectedCombination.paymentSurchargeTotal,
                          selectedCombination.currency,
                        )} processing fee`
                      : ''}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#8b1e2d]">
                    {formatMoney(selectedCombination.perPersonPrice, selectedCombination.currency)}{' '}
                    avg hotel payer
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {selectedCombination.flightOption && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Flight</p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      {selectedCombination.flightOption.title}
                    </p>
                    {selectedCombination.flightOption.summary && (
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                        {selectedCombination.flightOption.summary}
                      </p>
                    )}
                  </div>
                )}
                {selectedCombination.visaOptions.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Visa</p>
                    <div className="mt-1 space-y-2">
                      {selectedCombination.visaOptions.map((option) => (
                        <div key={option.id}>
                          <p className="text-sm font-black text-slate-950">
                            {getVisaQuantity(option, selectedCombination.servicePassengers)} x{' '}
                            {option.title}
                          </p>
                          {option.summary && (
                            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                              {option.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCombination.transportOption && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Transport</p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      {selectedCombination.transportOption.title}
                    </p>
                    {selectedCombination.transportOption.summary && (
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                        {selectedCombination.transportOption.summary}
                      </p>
                    )}
                  </div>
                )}
                {selectedCombination.staySelections.map((stay) => (
                  <div key={stay.groupId} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">{stay.groupLabel}</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{stay.option.title}</p>
                    {stay.option.summary && (
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                        {stay.option.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {selectedCombination.offerDiscountTotal > 0 && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  Discount applied:{' '}
                  {formatMoney(
                    selectedCombination.offerDiscountTotal,
                    selectedCombination.currency,
                  )}
                </p>
              )}

              {quoteSelectionNote && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                  <span className="font-black text-slate-800">Selection note:</span>{' '}
                  {quoteSelectionNote}
                </p>
              )}
            </div>

            {packageFolder.source_quote_id && (
              <div className="flex flex-col gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
                <Link
                  href={`/dashboard/packages/quotations/${packageFolder.source_quote_id}/edit`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Quote
                </Link>
                <Link
                  href={`/dashboard/packages/quotations/${packageFolder.source_quote_id}/sales`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800"
                >
                  <PackageCheck className="h-4 w-4" />
                  Sales Mode
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
