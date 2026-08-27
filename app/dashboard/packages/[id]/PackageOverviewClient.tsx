'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  BadgePoundSterling,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
  TravelPackageGroup,
  TravelPackageInvoice,
  TravelPackageInvoiceStatus,
  TravelPackageReservation,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
  TravelPackageThirdPartyDocumentShare,
} from '@/app/types/packages'
import { formatMoney, getLinkedFlightOptionTotal } from '@/lib/packageQuote'
import { calculateTravelPackageDiscountAllocations } from '@/lib/packageDiscountAllocations'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'
import { renderStandaloneAccessVoucherHtml } from '@/lib/packageTransportVoucher'
import {
  PACKAGE_DOCUMENT_CATEGORIES,
  THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES,
  getPackageDocumentCategoryLabel,
  groupPackageDocumentsByCategory,
} from '@/lib/packageDocuments'
import PackageOperationsWorkspace from './PackageOperationsWorkspace'
import PackageInvoiceLinesEditor from './PackageInvoiceLinesEditor'
import PackageOverviewDialogs from './PackageOverviewDialogs'
import PackageFinalQuoteSnapshot from './PackageFinalQuoteSnapshot'
import PackageGroupPanel from './PackageGroupPanel'
import type {
  DocumentsResponse,
  InvoiceFormState,
  InvoiceResponse,
  PackageGroupResponse,
  PackageGroupsResponse,
  PackageOverviewClientProps,
  PackageResponse,
  PackageWorkspaceTab,
  QuoteReservationPrefill,
  ReservationDetailFormState,
  ReservationFinancialFormState,
  ReservationFormState,
  ReservationItemFormState,
  ReservationRefundFormState,
  ReservationsResponse,
  ThirdPartyShareFormState,
  ThirdPartySharesResponse,
} from './packageOverviewTypes'
import {
  CUSTOMER_PORTAL_URL,
  VISA_PHOTO_DOCUMENT_KIND,
  createInitialInvoiceForm,
  createInitialReservationForm,
  createInitialReservationItemForm,
  createInitialReservationRefundForm,
  createInitialThirdPartyShareForm,
  createReservationDetailForm,
  createReservationFinancialForm,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatReservationStatus,
  getLinkedVisaPhotoParentId,
  getOptionSoldTotal,
  getReservationSummary,
  getStaySelectionSoldTotal,
  getTransportReservationSummary,
  getVisaOptionSoldTotal,
  getVisaPassengerCategoryLabel,
  getVisaQuantity,
  invoiceStatusOptions,
  isVisaPhotoDocument,
  mapInvoiceToPackageInvoiceStatus,
  normalizeSelectedCombination,
  parseMoneyInput,
  reservationItemStatusOptions,
  reservationItemTypeOptions,
  reservationStatusOptions,
  reservationTypeOptions,
  toDateTimeLocalValue,
} from './packageOverviewModel'
import type { VisaPassengerCounts } from './packageOverviewModel'
import { getReservationIcon, PackageStatusCard } from './PackageOverviewPrimitives'
import { useAppDialog } from '@/components/AppDialog'

export default function PackageOverviewClient({
  packageId,
  employees = [],
}: PackageOverviewClientProps) {
  const { confirm, dialog } = useAppDialog()
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [reservations, setReservations] = useState<TravelPackageReservation[]>([])
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [thirdPartyShares, setThirdPartyShares] = useState<TravelPackageThirdPartyDocumentShare[]>(
    [],
  )
  const [thirdPartyShareForm, setThirdPartyShareForm] = useState<ThirdPartyShareFormState>(() =>
    createInitialThirdPartyShareForm(),
  )
  const [generatedThirdPartyShare, setGeneratedThirdPartyShare] = useState<{
    shareUrl: string
    accessCode: string
    recipientName: string
  } | null>(null)
  const [invoice, setInvoice] = useState<TravelPackageInvoice | null>(null)
  const [selectedInvoiceQuoteId, setSelectedInvoiceQuoteId] = useState('')
  const [reservationForm, setReservationForm] = useState<ReservationFormState>(() =>
    createInitialReservationForm(),
  )
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(() => createInitialInvoiceForm())
  const [draggingDocumentCategory, setDraggingDocumentCategory] =
    useState<TravelPackageDocumentCategory | null>(null)
  const [itemForms, setItemForms] = useState<Record<string, ReservationItemFormState>>({})
  const [reservationDetailForms, setReservationDetailForms] = useState<
    Record<string, ReservationDetailFormState>
  >({})
  const [reservationFinancialForms, setReservationFinancialForms] = useState<
    Record<string, ReservationFinancialFormState>
  >({})
  const [reservationRefundForms, setReservationRefundForms] = useState<
    Record<string, ReservationRefundFormState>
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
  const [savingReservationRefundId, setSavingReservationRefundId] = useState<string | null>(null)
  const [savingDocument, setSavingDocument] = useState(false)
  const [savingThirdPartyShare, setSavingThirdPartyShare] = useState(false)
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null)
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null)
  const [documentRenameForm, setDocumentRenameForm] = useState({ name: '' })
  const [previewDocument, setPreviewDocument] = useState<TravelPackageDocument | null>(null)
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState('')
  const [previewDocumentLoading, setPreviewDocumentLoading] = useState(false)
  const [photoLinkDocument, setPhotoLinkDocument] = useState<TravelPackageDocument | null>(null)
  const [updatingReservationId, setUpdatingReservationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reservationError, setReservationError] = useState<string | null>(null)
  const [reservationNotice, setReservationNotice] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [showQuoteSnapshot, setShowQuoteSnapshot] = useState(false)
  const [showAccessVoucher, setShowAccessVoucher] = useState(false)
  const [showPackageGroupPanel, setShowPackageGroupPanel] = useState(false)
  const [showNewReservationForm, setShowNewReservationForm] = useState(false)
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [accessVoucherQr, setAccessVoucherQr] = useState('')
  const [printAccessVoucherQr, setPrintAccessVoucherQr] = useState('')
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
        setReservationDetailForms((current) => {
          const next = { ...current }
          withItems.forEach((reservation) => {
            if (!next[reservation.id]) {
              next[reservation.id] = createReservationDetailForm(reservation)
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
    const loadThirdPartyShares = async () => {
      try {
        const response = await fetch(
          `/api/travel-packages/${encodeURIComponent(packageId)}/third-party-document-shares`,
        )
        const data = (await response.json()) as ThirdPartySharesResponse
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Unable to load third-party shares')
        }
        if (data.setupRequired) {
          setThirdPartyShares([])
          return
        }
        setThirdPartyShares(data.shares || [])
      } catch {
        setThirdPartyShares([])
      }
    }

    void loadThirdPartyShares()
  }, [packageId])

  useEffect(() => {
    const loadInvoice = async () => {
      setInvoiceLoading(true)
      setInvoiceError(null)
      try {
        const invoiceQuery = selectedInvoiceQuoteId
          ? `?quoteId=${encodeURIComponent(selectedInvoiceQuoteId)}`
          : ''
        const response = await fetch(
          `/api/travel-packages/${encodeURIComponent(packageId)}/invoice${invoiceQuery}`,
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
  }, [packageId, selectedInvoiceQuoteId])

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
          metadata: {
            packageReference: packageFolder.package_reference,
            customerName: packageFolder.customer_name,
          },
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
            metadata: {
              packageReference: packageFolder.package_reference,
              customerName: packageFolder.customer_name,
            },
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
  const groupInvoiceFamilies = useMemo(
    () => packageFolder?.selected_quote_snapshot?.group?.families || [],
    [packageFolder?.selected_quote_snapshot?.group?.families],
  )
  const selectedInvoiceFamily = groupInvoiceFamilies.find(
    (family) => family.quoteId === selectedInvoiceQuoteId,
  )
  useEffect(() => {
    if (groupInvoiceFamilies.length === 0) {
      if (selectedInvoiceQuoteId) setSelectedInvoiceQuoteId('')
      return
    }
    if (!groupInvoiceFamilies.some((family) => family.quoteId === selectedInvoiceQuoteId)) {
      setSelectedInvoiceQuoteId(groupInvoiceFamilies[0].quoteId)
    }
  }, [groupInvoiceFamilies, selectedInvoiceQuoteId])
  const defaultSoldPrice = selectedCombination?.totalPrice || 0
  const passengerSummary = packageFolder?.passenger_summary
  const selectedVisaPassengerCounts = useMemo<VisaPassengerCounts>(
    () => ({
      adults: Number(selectedPayload?.adults ?? passengerSummary?.adults ?? 0),
      childrenPaying: Number(
        selectedPayload?.childrenPaying ?? passengerSummary?.childrenPaying ?? 0,
      ),
      childrenFree: Number(selectedPayload?.childrenFree ?? passengerSummary?.childrenFree ?? 0),
      infants: Number(selectedPayload?.infants ?? passengerSummary?.infants ?? 0),
      servicePassengers: Number(
        selectedCombination?.servicePassengers ?? passengerSummary?.servicePassengers ?? 0,
      ),
    }),
    [passengerSummary, selectedCombination, selectedPayload],
  )
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
  const visaPhotoDocuments = useMemo(
    () =>
      documents.filter(
        (document) => document.category === 'travel_documents' && isVisaPhotoDocument(document),
      ),
    [documents],
  )
  const visaPhotosByTravelDocumentId = useMemo(() => {
    return visaPhotoDocuments.reduce(
      (photosByDocument, document) => {
        const parentId = getLinkedVisaPhotoParentId(document)
        if (!parentId) return photosByDocument
        photosByDocument[parentId] = [...(photosByDocument[parentId] || []), document]
        return photosByDocument
      },
      {} as Record<string, TravelPackageDocument[]>,
    )
  }, [visaPhotoDocuments])
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
  const previewDocumentType = previewDocument?.file_type || ''
  const previewDocumentIsImage = previewDocumentType.startsWith('image/')
  const previewDocumentIsPdf = previewDocumentType === 'application/pdf'
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
  const reservationDiscountAllocations = useMemo(
    () =>
      calculateTravelPackageDiscountAllocations(
        reservations,
        packageFolder?.selected_quote_snapshot,
      ),
    [packageFolder?.selected_quote_snapshot, reservations],
  )
  const reservationTotals = useMemo(() => {
    return reservations.reduce(
      (totals, reservation) => {
        const supplierRefund = Number(reservation.supplier_refund_total || 0)
        const customerRefund = Number(reservation.customer_refund_total || 0)
        totals.booked += Math.max(0, Number(reservation.booked_cost_total || 0) - supplierRefund)
        totals.sold += Math.max(0, Number(reservation.sold_price_total || 0) - customerRefund)
        totals.discount += Number(reservation.discount_total || 0)
        totals.commission += Number(reservation.commission_expected_total || 0)
        totals.supplierRefund += supplierRefund
        totals.customerRefund += customerRefund
        return totals
      },
      {
        booked: 0,
        sold: 0,
        discount: 0,
        commission: 0,
        supplierRefund: 0,
        customerRefund: 0,
      },
    )
  }, [reservations])
  const bookedSoldDifference =
    reservationTotals.sold - reservationTotals.discount - reservationTotals.booked
  const estimatedMargin = bookedSoldDifference + reservationTotals.commission
  const netReservationSold = reservationTotals.sold - reservationTotals.discount
  const quoteReservationPrefills = useMemo<QuoteReservationPrefill[]>(() => {
    if (!selectedCombination) return []
    const servicePassengers = selectedCombination.servicePassengers
    const prefills: QuoteReservationPrefill[] = []
    if (selectedCombination.flightOption) {
      const linkedFlightSoldTotal =
        selectedPayload && selectedCombination.linkedFlightSelections.length > 0
          ? selectedCombination.linkedFlightSelections.reduce(
              (total, selection) =>
                total +
                getLinkedFlightOptionTotal(selection.group, selection.option, selectedPayload),
              0,
            )
          : 0
      const linkedFlightNotes = selectedCombination.linkedFlightSelections
        .map(
          (selection) =>
            `${selection.group.routeLabel}: ${selection.option.airlineName}${
              selection.option.summary ? `\n${selection.option.summary}` : ''
            }`,
        )
        .join('\n\n')
      prefills.push({
        key: `flight-${selectedCombination.flightOption.id}`,
        reservationType: 'flight',
        title: selectedCombination.flightOption.title,
        soldPriceTotal:
          getOptionSoldTotal(
            selectedCombination.flightOption,
            servicePassengers,
            passengerSummary,
          ) + linkedFlightSoldTotal,
        internalNotes: [
          getReservationSummary(selectedCombination.flightOption),
          linkedFlightNotes ? `Linked included flight legs:\n${linkedFlightNotes}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        sourceLabel: 'Flight from final quote',
      })
    }
    selectedCombination.visaOptions.forEach((option) => {
      const quantity = getVisaQuantity(option, selectedVisaPassengerCounts)
      prefills.push({
        key: `visa-${option.id}`,
        reservationType: 'visa',
        title: `${quantity} x ${getVisaPassengerCategoryLabel(
          option.visaPassengerCategory,
        )} ${option.title}`,
        soldPriceTotal: getVisaOptionSoldTotal(option, selectedVisaPassengerCounts),
        internalNotes: getReservationSummary(option),
        sourceLabel: 'Visa from final quote',
        metadata: {
          optionId: option.id,
          quantity,
          visaPassengerCategory: option.visaPassengerCategory || 'all',
        },
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
        sourceLabel: 'Transport from final quote',
      })
    }
    selectedCombination.staySelections.forEach((stay) => {
      prefills.push({
        key: `hotel-${stay.groupId}-${stay.option.id}`,
        reservationType: 'hotel',
        title: `${stay.groupLabel}: ${stay.option.title}`,
        soldPriceTotal: getStaySelectionSoldTotal(stay),
        internalNotes: [
          getReservationSummary(stay.option),
          stay.addonOptions?.length
            ? `Selected extras:\n${stay.addonOptions
                .map(
                  (addon) =>
                    `* ${addon.label} - ${formatMoney(addon.adjustedPrice, reservationCurrency)}`,
                )
                .join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        sourceLabel: `${stay.groupLabel} hotel from final quote`,
      })
    })
    const componentTotal = prefills.reduce((total, prefill) => total + prefill.soldPriceTotal, 0)
    const adjustment = Math.round((selectedCombination.totalPrice - componentTotal) * 100) / 100
    if (adjustment > 0) {
      prefills.push({
        key: 'package-pricing-adjustment',
        reservationType: 'other',
        title: 'Package pricing adjustment',
        soldPriceTotal: adjustment,
        internalNotes: 'Package-level surcharge or processing adjustment from the final quotation.',
        sourceLabel: 'Package adjustment from final quote',
      })
    } else if (adjustment < 0) {
      prefills.push({
        key: 'package-discount-adjustment',
        reservationType: 'other',
        title: 'Package discount adjustment',
        soldPriceTotal: 0,
        discountTotal: Math.abs(adjustment),
        internalNotes: 'Package-level discount from the final quotation.',
        sourceLabel: 'Package discount from final quote',
      })
    }
    return prefills
  }, [
    passengerSummary,
    reservationCurrency,
    selectedCombination,
    selectedPayload,
    selectedVisaPassengerCounts,
  ])
  const quoteReservationMissingCount = useMemo(() => {
    const existingSourceKeys = new Set(
      reservations
        .map((reservation) => {
          const metadata = reservation.metadata || {}
          return typeof metadata.sourceKey === 'string' ? metadata.sourceKey : ''
        })
        .filter(Boolean),
    )
    return quoteReservationPrefills.filter((prefill) => !existingSourceKeys.has(prefill.key)).length
  }, [quoteReservationPrefills, reservations])
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
  const invoicePreviewLines = useMemo(
    () => (invoice?.lines || []).filter((line) => line.customer_visible),
    [invoice?.lines],
  )
  const invoicePreviewDueDate = invoiceForm.dueAt
    ? new Date(invoiceForm.dueAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not set'
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
  const generatedThirdPartyShareDetailsText = generatedThirdPartyShare
    ? `Third-party document access
Package: ${packageFolder?.package_reference || packageId}
Recipient: ${generatedThirdPartyShare.recipientName || 'Not specified'}
Link: ${generatedThirdPartyShare.shareUrl}
Access code: ${generatedThirdPartyShare.accessCode}

Please enter the access code and accept the data handling terms before downloading documents.`
    : ''

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
    QRCode.toDataURL(CUSTOMER_PORTAL_URL, {
      width: 220,
      margin: 1,
      color: { dark: '#3b0a12', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setPrintAccessVoucherQr(url)
      })
      .catch(() => {
        if (active) setPrintAccessVoucherQr('')
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
      setReservationDetailForms((current) => ({
        ...current,
        [createdReservation.id]: createReservationDetailForm(createdReservation),
      }))
      setReservationForm(createInitialReservationForm(defaultSoldPrice))
      setShowNewReservationForm(false)
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to create reservation',
      )
    } finally {
      setSavingReservation(false)
    }
  }

  const applyReservationPrefill = (prefill: QuoteReservationPrefill) => {
    setShowNewReservationForm(true)
    setReservationForm((current) => ({
      ...current,
      reservationType: prefill.reservationType,
      title: prefill.title,
      status: 'reservation_pending',
      soldPriceTotal: prefill.soldPriceTotal > 0 ? String(prefill.soldPriceTotal) : '',
      discountTotal:
        prefill.discountTotal && prefill.discountTotal > 0 ? String(prefill.discountTotal) : '',
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

  const createReservationFromPrefill = async (prefill: QuoteReservationPrefill) => {
    if (!packageFolder) throw new Error('Package folder unavailable')
    const response = await fetch(
      `/api/travel-packages/${encodeURIComponent(packageId)}/reservations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: packageFolder.source_quote_id,
          reservationType: prefill.reservationType,
          title: prefill.title,
          status: 'reservation_pending',
          bookedCostTotal: prefill.bookedCostTotal || 0,
          soldPriceTotal: prefill.soldPriceTotal,
          discountTotal: prefill.discountTotal || 0,
          paymentDueAt: toDateTimeLocalValue(),
          internalNotes: prefill.internalNotes,
          currency: reservationCurrency,
          metadata: {
            source: 'final_quote',
            sourceKey: prefill.key,
            sourceLabel: prefill.sourceLabel,
            ...(prefill.metadata || {}),
          },
        }),
      },
    )
    const data = (await response.json()) as ReservationsResponse
    if (!response.ok || !data.reservation) {
      throw new Error(data.message || data.error || 'Failed to create reservation from quote')
    }
    return data.reservation
  }

  const createAllQuoteReservations = async () => {
    if (!packageFolder || savingReservation || quoteReservationPrefills.length === 0) return
    setSavingReservation(true)
    setReservationError(null)
    try {
      const existingSourceKeys = new Set(
        reservations
          .map((reservation) => {
            const metadata = reservation.metadata || {}
            return typeof metadata.sourceKey === 'string' ? metadata.sourceKey : ''
          })
          .filter(Boolean),
      )
      const missingPrefills = quoteReservationPrefills.filter(
        (prefill) => !existingSourceKeys.has(prefill.key),
      )
      const createdReservations: TravelPackageReservation[] = []
      for (const prefill of missingPrefills) {
        createdReservations.push(await createReservationFromPrefill(prefill))
      }
      if (createdReservations.length === 0) return
      setReservations((current) => [...createdReservations, ...current])
      setItemForms((current) => {
        const next = { ...current }
        createdReservations.forEach((reservation) => {
          next[reservation.id] = createInitialReservationItemForm(reservation.reservation_type)
        })
        return next
      })
      setReservationFinancialForms((current) => {
        const next = { ...current }
        createdReservations.forEach((reservation) => {
          next[reservation.id] = createReservationFinancialForm(reservation)
        })
        return next
      })
      setReservationDetailForms((current) => {
        const next = { ...current }
        createdReservations.forEach((reservation) => {
          next[reservation.id] = createReservationDetailForm(reservation)
        })
        return next
      })
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to create reservations from quote',
      )
    } finally {
      setSavingReservation(false)
    }
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
      setReservationDetailForms((current) => ({
        ...current,
        [reservation.id]: createReservationDetailForm(data.reservation!),
      }))
    } catch (updateError) {
      setReservationError(
        updateError instanceof Error ? updateError.message : 'Failed to update reservation',
      )
    } finally {
      setUpdatingReservationId(null)
    }
  }

  const getReservationDetailForm = (reservation: TravelPackageReservation) => {
    return reservationDetailForms[reservation.id] || createReservationDetailForm(reservation)
  }

  const updateReservationDetailForm = <Key extends keyof ReservationDetailFormState>(
    reservation: TravelPackageReservation,
    key: Key,
    value: ReservationDetailFormState[Key],
  ) => {
    setReservationDetailForms((current) => ({
      ...current,
      [reservation.id]: {
        ...(current[reservation.id] || createReservationDetailForm(reservation)),
        [key]: value,
      },
    }))
  }

  const saveReservationDetails = async (reservation: TravelPackageReservation) => {
    const detailForm = getReservationDetailForm(reservation)
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
          body: JSON.stringify(detailForm),
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
      setReservationDetailForms((current) => ({
        ...current,
        [reservation.id]: createReservationDetailForm(data.reservation!),
      }))
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to update reservation',
      )
    } finally {
      setUpdatingReservationId(null)
    }
  }

  const deleteReservation = async (reservation: TravelPackageReservation) => {
    const shouldDelete = await confirm({
      title: 'Delete reservation?',
      message: `Delete reservation "${reservation.title}" and its operational details? This cannot be undone.`,
      confirmLabel: 'Delete reservation',
      type: 'danger',
    })
    if (!shouldDelete) return
    setUpdatingReservationId(reservation.id)
    setReservationError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations/${encodeURIComponent(
          reservation.id,
        )}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to delete reservation')
      }
      setReservations((current) => current.filter((item) => item.id !== reservation.id))
      setReservationDetailForms((current) => {
        const next = { ...current }
        delete next[reservation.id]
        return next
      })
      setReservationFinancialForms((current) => {
        const next = { ...current }
        delete next[reservation.id]
        return next
      })
      setItemForms((current) => {
        const next = { ...current }
        delete next[reservation.id]
        return next
      })
    } catch (deleteError) {
      setReservationError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete reservation',
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

  const printStandaloneAccessVoucher = () => {
    if (!packageFolder) return
    const html = renderStandaloneAccessVoucherHtml(
      packageFolder,
      printAccessVoucherQr || accessVoucherQr,
      {
        logoSrc: `${window.location.origin}/logo.png`,
      },
    )
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const preview = window.open(url, '_blank', 'noopener,noreferrer')
    if (!preview) {
      URL.revokeObjectURL(url)
      setAccessVoucherCopyMessage('Allow pop-ups to print the access voucher')
      return
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const uploadSingleDocumentFile = async (
    file: File,
    overrides: {
      title?: string
      category: TravelPackageDocumentCategory
      reservationId?: string
      publicNotes?: string
      internalNotes?: string
      customerVisible?: boolean
      metadata?: Record<string, unknown>
    },
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', overrides.title || file.name)
    formData.append('category', overrides.category)
    formData.append('reservationId', overrides.reservationId || '')
    formData.append('publicNotes', overrides.publicNotes || '')
    formData.append('internalNotes', overrides.internalNotes || '')
    formData.append('customerVisible', String(Boolean(overrides.customerVisible)))
    formData.append('metadata', JSON.stringify(overrides.metadata || {}))

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
    return data.document
  }

  const uploadDocumentFiles = async (
    files: FileList | File[],
    overrides: {
      category: TravelPackageDocumentCategory
      reservationId?: string
      publicNotes?: string
      internalNotes?: string
      customerVisible?: boolean
      metadata?: Record<string, unknown>
    },
  ) => {
    const selectedFiles = Array.from(files).filter(Boolean)
    if (savingDocument || selectedFiles.length === 0) return
    setSavingDocument(true)
    setDocumentError(null)
    try {
      const uploadedDocuments: TravelPackageDocument[] = []
      for (const file of selectedFiles) {
        const document = await uploadSingleDocumentFile(file, {
          ...overrides,
          title: file.name,
        })
        uploadedDocuments.push(document)
      }
      setDocuments((current) => [...uploadedDocuments.reverse(), ...current])
      setDraggingDocumentCategory(null)
    } catch (uploadError) {
      setDocumentError(
        uploadError instanceof Error ? uploadError.message : 'Failed to upload package documents',
      )
    } finally {
      setSavingDocument(false)
      setDraggingDocumentCategory(null)
    }
  }

  const uploadVisaPhotoFiles = async (
    files: FileList | File[],
    linkedTravelDocument?: TravelPackageDocument,
  ) => {
    const selectedFiles = Array.from(files).filter(Boolean)
    if (savingDocument || selectedFiles.length === 0) return
    setSavingDocument(true)
    setDocumentError(null)
    try {
      const uploadedDocuments: TravelPackageDocument[] = []
      for (const file of selectedFiles) {
        const linkedTitle = linkedTravelDocument?.title || linkedTravelDocument?.file_name || ''
        const document = await uploadSingleDocumentFile(file, {
          title: linkedTitle ? `Visa photo for ${linkedTitle}` : `Visa photo - ${file.name}`,
          category: 'travel_documents',
          internalNotes: linkedTitle
            ? `Linked photo for visa issuing. Parent document: ${linkedTitle}.`
            : 'Linked photo for visa issuing.',
          metadata: {
            documentKind: VISA_PHOTO_DOCUMENT_KIND,
            linkedPurpose: 'visa_issue',
            linkedTravelDocumentId: linkedTravelDocument?.id || null,
            linkedTravelDocumentTitle: linkedTitle || null,
            originalPhotoFileName: file.name,
          },
        })
        uploadedDocuments.push(document)
      }
      setDocuments((current) => [...uploadedDocuments.reverse(), ...current])
      setDraggingDocumentCategory(null)
      if (linkedTravelDocument) setPhotoLinkDocument(null)
    } catch (uploadError) {
      setDocumentError(
        uploadError instanceof Error ? uploadError.message : 'Failed to upload visa photo',
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

  const startDocumentRename = (document: TravelPackageDocument) => {
    setRenamingDocumentId(document.id)
    setDocumentRenameForm({
      name: document.title || document.file_name,
    })
  }

  const saveDocumentRename = async (document: TravelPackageDocument) => {
    setUpdatingDocumentId(document.id)
    setDocumentError(null)
    try {
      const renameName = documentRenameForm.name.trim()
      const currentExtension = document.file_name.match(/(\.[A-Za-z0-9]{1,10})$/)?.[1] || ''
      const renameFileName =
        currentExtension && !renameName.toLowerCase().endsWith(currentExtension.toLowerCase())
          ? `${renameName}${currentExtension}`
          : renameName
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
          document.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: renameName,
            fileName: renameFileName,
          }),
        },
      )
      const data = (await response.json()) as DocumentsResponse
      if (!response.ok || !data.document) {
        throw new Error(data.message || data.error || 'Failed to rename package document')
      }
      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? data.document! : item)),
      )
      setRenamingDocumentId(null)
      if (previewDocument?.id === document.id) setPreviewDocument(data.document)
    } catch (renameError) {
      setDocumentError(
        renameError instanceof Error ? renameError.message : 'Failed to rename package document',
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
      if (previewDocument?.id === document.id) {
        setPreviewDocument(null)
        setPreviewDocumentUrl('')
      }
    } catch (deleteError) {
      setDocumentError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete package document',
      )
    } finally {
      setUpdatingDocumentId(null)
    }
  }

  const openDocumentPreview = async (document: TravelPackageDocument) => {
    setPreviewDocument(document)
    setPreviewDocumentUrl('')
    setPreviewDocumentLoading(true)
    setDocumentError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
          document.id,
        )}/signed-url?disposition=inline`,
      )
      const data = (await response.json()) as { url?: string; error?: string; message?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.message || data.error || 'Failed to prepare document preview')
      }
      setPreviewDocumentUrl(data.url)
    } catch (previewError) {
      setDocumentError(
        previewError instanceof Error ? previewError.message : 'Failed to prepare document preview',
      )
      setPreviewDocument(null)
    } finally {
      setPreviewDocumentLoading(false)
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

  const toggleThirdPartyShareCategory = (category: TravelPackageDocumentCategory) => {
    setThirdPartyShareForm((current) => {
      const active = current.allowedCategories.includes(category)
      const nextCategories = active
        ? current.allowedCategories.filter((item) => item !== category)
        : [...current.allowedCategories, category]
      return {
        ...current,
        allowedCategories:
          nextCategories.length > 0 ? nextCategories : [...THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES],
      }
    })
  }

  const createThirdPartyShare = async () => {
    setSavingThirdPartyShare(true)
    setDocumentError(null)
    setGeneratedThirdPartyShare(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/third-party-document-shares`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: thirdPartyShareForm.label,
            recipientName: thirdPartyShareForm.recipientName,
            purpose: thirdPartyShareForm.purpose,
            expiresAt: thirdPartyShareForm.expiresAt
              ? new Date(thirdPartyShareForm.expiresAt).toISOString()
              : '',
            allowedCategories: thirdPartyShareForm.allowedCategories,
          }),
        },
      )
      const data = (await response.json()) as ThirdPartySharesResponse
      if (!response.ok || data.setupRequired || !data.share || !data.shareUrl || !data.accessCode) {
        throw new Error(data.message || data.error || 'Failed to create third-party share')
      }
      setThirdPartyShares((current) => [data.share!, ...current])
      setGeneratedThirdPartyShare({
        shareUrl: data.shareUrl,
        accessCode: data.accessCode,
        recipientName:
          data.share.recipient_name || thirdPartyShareForm.recipientName.trim() || 'Not specified',
      })
      setThirdPartyShareForm(createInitialThirdPartyShareForm())
    } catch (shareError) {
      setDocumentError(
        shareError instanceof Error ? shareError.message : 'Failed to create third-party share',
      )
    } finally {
      setSavingThirdPartyShare(false)
    }
  }

  const revokeThirdPartyShare = async (share: TravelPackageThirdPartyDocumentShare) => {
    setSavingThirdPartyShare(true)
    setDocumentError(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(
          packageId,
        )}/third-party-document-shares/${encodeURIComponent(share.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'revoked' }),
        },
      )
      const data = (await response.json()) as ThirdPartySharesResponse
      if (!response.ok || data.setupRequired || !data.share) {
        throw new Error(data.message || data.error || 'Failed to revoke third-party share')
      }
      setThirdPartyShares((current) =>
        current.map((item) => (item.id === data.share!.id ? data.share! : item)),
      )
    } catch (shareError) {
      setDocumentError(
        shareError instanceof Error ? shareError.message : 'Failed to revoke third-party share',
      )
    } finally {
      setSavingThirdPartyShare(false)
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
            quoteId: selectedInvoiceFamily?.quoteId || null,
            familyLabel: selectedInvoiceFamily?.familyLabel || null,
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

  const getReservationRefundForm = (reservation: TravelPackageReservation) =>
    reservationRefundForms[reservation.id] || createInitialReservationRefundForm()

  const updateReservationRefundForm = <Key extends keyof ReservationRefundFormState>(
    reservation: TravelPackageReservation,
    key: Key,
    value: ReservationRefundFormState[Key],
  ) => {
    setReservationRefundForms((current) => ({
      ...current,
      [reservation.id]: {
        ...(current[reservation.id] || createInitialReservationRefundForm()),
        [key]: value,
      },
    }))
  }

  const recordReservationRefund = async (reservation: TravelPackageReservation) => {
    const refundForm = getReservationRefundForm(reservation)
    setSavingReservationRefundId(reservation.id)
    setReservationError(null)
    setReservationNotice(null)
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/reservations/${encodeURIComponent(
          reservation.id,
        )}/refunds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...refundForm,
            invoiceId: invoice?.id || null,
          }),
        },
      )
      const data = (await response.json()) as ReservationsResponse
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || data.error || 'Failed to record reservation refund')
      }

      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id ? { ...data.reservation!, items: item.items } : item,
        ),
      )
      setReservationRefundForms((current) => ({
        ...current,
        [reservation.id]: createInitialReservationRefundForm(),
      }))
      setReservationNotice(
        refundForm.refundKind === 'customer'
          ? 'Customer refund recorded in this reservation and in Payments. Amend or regenerate a draft invoice to update its sales lines.'
          : 'Supplier credit recorded and deducted from the net booked cost.',
      )
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to record reservation refund',
      )
    } finally {
      setSavingReservationRefundId(null)
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
      {dialog}
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
            <button
              type="button"
              onClick={() => setShowPackageGroupPanel((current) => !current)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-900 px-4 text-sm font-black text-white transition hover:bg-cyan-800"
            >
              <Link2 className="h-4 w-4" />
              Add Package Link
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PackageStatusCard
          icon={PackageCheck}
          label="Package status"
          value={packageFolder.status}
        />
        <PackageStatusCard
          icon={ShieldCheck}
          label="Passports"
          value={packageFolder.passport_status}
        />
        <PackageStatusCard icon={CreditCard} label="Payment" value={packageFolder.payment_status} />
        <PackageStatusCard icon={FileText} label="Invoice" value={packageFolder.invoice_status} />
      </section>

      {showPackageGroupPanel && (
        <PackageGroupPanel
          packageId={packageId}
          packageFolder={packageFolder}
          packageGroupError={packageGroupError}
          packageGroupTitle={packageGroupTitle}
          setPackageGroupTitle={setPackageGroupTitle}
          packageGroupFamilyLabel={packageGroupFamilyLabel}
          setPackageGroupFamilyLabel={setPackageGroupFamilyLabel}
          packageGroupSearch={packageGroupSearch}
          setPackageGroupSearch={setPackageGroupSearch}
          packageGroupSelectedId={packageGroupSelectedId}
          setPackageGroupSelectedId={setPackageGroupSelectedId}
          packageGroupLoading={packageGroupLoading}
          packageGroupSaving={packageGroupSaving}
          filteredPackageGroups={filteredPackageGroups}
          activePackageGroup={activePackageGroup}
          packageGroupTransportNote={packageGroupTransportNote}
          setPackageGroupTransportNote={setPackageGroupTransportNote}
          onCreateGroup={() => void createPackageGroup()}
          onLinkPackage={() => void linkPackageToGroup()}
          onUnlinkPackage={() => void unlinkPackageFromGroup()}
          onSaveTransportNote={() => void updatePackageGroupTransportNote()}
        />
      )}

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
                  employees={employees}
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
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Upload className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase text-[#8b1e2d]">Package folder</p>
                        <h2 className="text-lg font-black text-slate-950">Documents</h2>
                      </div>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Upload, release, preview, and share package files from one controlled
                      workspace. Customer files stay separate from agent-only travel documents.
                    </p>
                  </div>
                  {documentsLoading && (
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading documents
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {documentError && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                    {documentError}
                  </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
                  <div className="contents">
                    <div className="order-1 grid gap-3 md:grid-cols-3 xl:col-start-1">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">
                          Total documents
                        </p>
                        <p className="mt-1 text-2xl font-black text-slate-950">
                          {documents.length}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-bold uppercase text-emerald-700">
                          Released to customer
                        </p>
                        <p className="mt-1 text-2xl font-black text-emerald-950">
                          {visibleDocumentCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold uppercase text-amber-700">
                          Agent-only documents
                        </p>
                        <p className="mt-1 text-2xl font-black text-amber-950">
                          {documentCountsByCategory.travel_documents || 0}
                        </p>
                      </div>
                    </div>

                    <section className="order-4 rounded-xl border border-slate-200 bg-white xl:col-span-2">
                      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">Upload documents</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Choose a category first, then click or drop files directly into it.
                          </p>
                        </div>
                        {savingDocument && (
                          <span className="inline-flex items-center gap-2 text-xs font-black text-[#8b1e2d]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Uploading
                          </span>
                        )}
                      </div>
                      <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
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
                                const files = event.dataTransfer.files
                                if (files?.length) {
                                  void uploadDocumentFiles(files, {
                                    category: category.value,
                                  })
                                }
                              }}
                              className={`group flex min-h-24 cursor-pointer items-start justify-between gap-3 rounded-lg border-2 border-dashed p-3 transition ${
                                activeDrop
                                  ? 'border-[#8b1e2d] bg-red-50'
                                  : 'border-slate-300 bg-slate-50 hover:border-[#8b1e2d]/50 hover:bg-white'
                              }`}
                            >
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                className="sr-only"
                                disabled={savingDocument}
                                onChange={(event) => {
                                  const files = Array.from(event.currentTarget.files || [])
                                  event.currentTarget.value = ''
                                  if (files.length) {
                                    void uploadDocumentFiles(files, {
                                      category: category.value,
                                    })
                                  }
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-black text-slate-950">
                                  {category.label}
                                </span>
                                <span className="mt-1 block text-xs font-bold text-slate-500">
                                  {documentCountsByCategory[category.value] || 0} uploaded
                                </span>
                                {category.agentOnly && (
                                  <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black uppercase text-amber-800">
                                    Agents only
                                  </span>
                                )}
                                <span className="mt-2 block text-[11px] font-semibold text-slate-500">
                                  Drop files or click to upload
                                </span>
                              </span>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200 transition group-hover:bg-[#8b1e2d] group-hover:text-white">
                                <Upload className="h-4 w-4" />
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </section>

                    <section className="order-5 rounded-xl border border-slate-200 bg-white xl:col-span-2">
                      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">Document library</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Review files by category. Travel document photos are nested under the
                            passport they belong to.
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                          {documents.length} files
                        </span>
                      </div>
                      <div className="space-y-3 p-3">
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
                                {(group.value === 'travel_documents'
                                  ? group.documents.filter(
                                      (document) => !isVisaPhotoDocument(document),
                                    )
                                  : group.documents
                                ).map((document) => {
                                  const updatingThisDocument = updatingDocumentId === document.id
                                  const renamingThisDocument = renamingDocumentId === document.id
                                  const documentIsReleased =
                                    document.customer_visible && document.status === 'released'
                                  const documentIsAgentOnly =
                                    document.category === 'travel_documents'
                                  const documentIsVisaPhoto = isVisaPhotoDocument(document)
                                  const linkedVisaPhotos =
                                    visaPhotosByTravelDocumentId[document.id] || []
                                  return (
                                    <div
                                      key={document.id}
                                      className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          {renamingThisDocument ? (
                                            <div className="w-full min-w-0">
                                              <input
                                                value={documentRenameForm.name}
                                                onChange={(event) =>
                                                  setDocumentRenameForm((current) => ({
                                                    ...current,
                                                    name: event.target.value,
                                                  }))
                                                }
                                                placeholder="Document name"
                                                className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
                                              />
                                            </div>
                                          ) : (
                                            <p className="text-sm font-black text-slate-950">
                                              {document.title}
                                            </p>
                                          )}
                                          <span
                                            className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                                              documentIsAgentOnly
                                                ? 'bg-amber-50 text-amber-700'
                                                : documentIsReleased
                                                  ? 'bg-emerald-50 text-emerald-700'
                                                  : 'bg-slate-100 text-slate-500'
                                            }`}
                                          >
                                            {documentIsAgentOnly
                                              ? 'Agents only'
                                              : documentIsReleased
                                                ? 'Released'
                                                : 'Internal'}
                                          </span>
                                          {documentIsVisaPhoto && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-black uppercase text-indigo-700">
                                              <FileImage className="h-3 w-3" />
                                              Visa photo
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-1 break-all text-xs font-bold text-slate-500">
                                          {document.file_name} ·{' '}
                                          {formatFileSize(document.file_size)}
                                        </p>
                                        {document.reservation_id && (
                                          <p className="mt-1 text-xs font-bold text-slate-500">
                                            Linked to{' '}
                                            {reservationTitleById.get(document.reservation_id) ||
                                              'reservation'}
                                          </p>
                                        )}
                                        {documentIsVisaPhoto &&
                                          typeof document.metadata?.linkedTravelDocumentTitle ===
                                            'string' && (
                                            <p className="mt-1 text-xs font-bold text-indigo-700">
                                              Photo for{' '}
                                              {document.metadata.linkedTravelDocumentTitle}
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
                                        {document.category === 'travel_documents' &&
                                          !documentIsVisaPhoto &&
                                          linkedVisaPhotos.length > 0 && (
                                            <div className="mt-3 w-full rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-3">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-xs font-black uppercase text-indigo-700">
                                                  Linked visa photos
                                                </p>
                                                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-indigo-700">
                                                  {linkedVisaPhotos.length}
                                                </span>
                                              </div>
                                              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                                {linkedVisaPhotos.map((photo) => {
                                                  const updatingPhoto =
                                                    updatingDocumentId === photo.id
                                                  return (
                                                    <div
                                                      key={photo.id}
                                                      className="min-w-0 rounded-lg border border-indigo-100 bg-white p-2 shadow-sm"
                                                    >
                                                      <div className="min-w-0">
                                                        <p
                                                          className="truncate text-xs font-black text-indigo-950"
                                                          title={photo.title}
                                                        >
                                                          {photo.title}
                                                        </p>
                                                        <p
                                                          className="mt-0.5 truncate text-[11px] font-bold text-indigo-700"
                                                          title={photo.file_name}
                                                        >
                                                          {photo.file_name} ·{' '}
                                                          {formatFileSize(photo.file_size)}
                                                        </p>
                                                      </div>
                                                      <div className="mt-2 flex flex-wrap gap-2">
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            void openDocumentPreview(photo)
                                                          }
                                                          disabled={updatingPhoto}
                                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 text-[11px] font-black text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                                        >
                                                          <FileText className="h-3 w-3" />
                                                          Preview
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            void downloadDocument(photo)
                                                          }
                                                          disabled={updatingPhoto}
                                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 text-[11px] font-black text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                                        >
                                                          {updatingPhoto ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                          ) : (
                                                            <Download className="h-3 w-3" />
                                                          )}
                                                          Open
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => void deleteDocument(photo)}
                                                          disabled={updatingPhoto}
                                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-rose-100 bg-white px-2 text-[11px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                          Delete
                                                        </button>
                                                      </div>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )}
                                      </div>
                                      <div className="flex shrink-0 flex-wrap gap-2">
                                        {renamingThisDocument ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => void saveDocumentRename(document)}
                                              disabled={updatingThisDocument}
                                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                            >
                                              {updatingThisDocument ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <CheckCircle2 className="h-4 w-4" />
                                              )}
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setRenamingDocumentId(null)}
                                              disabled={updatingThisDocument}
                                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                            >
                                              <X className="h-4 w-4" />
                                              Cancel
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => startDocumentRename(document)}
                                            disabled={updatingThisDocument}
                                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                          >
                                            <Pencil className="h-4 w-4" />
                                            Rename
                                          </button>
                                        )}
                                        {document.category === 'travel_documents' &&
                                          !documentIsVisaPhoto && (
                                            <button
                                              type="button"
                                              onClick={() => setPhotoLinkDocument(document)}
                                              disabled={updatingThisDocument}
                                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                            >
                                              <FileImage className="h-4 w-4" />
                                              Link photo
                                            </button>
                                          )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void openDocumentPreview(document)
                                          }}
                                          disabled={updatingThisDocument}
                                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                        >
                                          <FileText className="h-4 w-4" />
                                          Preview
                                        </button>
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
                                            if (documentIsAgentOnly) return
                                            void updateDocumentVisibility(
                                              document,
                                              !documentIsReleased,
                                            )
                                          }}
                                          disabled={updatingThisDocument || documentIsAgentOnly}
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
                    </section>
                  </div>
                  <aside className="contents">
                    <section className="order-2 rounded-xl border border-slate-200 bg-white p-4 xl:col-start-1">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8b1e2d] text-white">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-950">Customer access</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                            Customers use the booking portal with the package reference and lead
                            surname.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
                        <div>
                          <p className="text-[11px] font-black uppercase text-slate-500">
                            Login website
                          </p>
                          <p className="mt-1 break-all text-sm font-black text-slate-950">
                            {CUSTOMER_PORTAL_URL.replace('https://', '')}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-[11px] font-black uppercase text-slate-500">
                              Reference
                            </p>
                            <p className="mt-1 font-mono text-sm font-black text-[#8b1e2d]">
                              {packageFolder.package_reference}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-[11px] font-black uppercase text-slate-500">
                              Lead surname
                            </p>
                            <p className="mt-1 text-sm font-black capitalize text-slate-950">
                              {customerAccessLastName}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void copyAccessVoucherText(accessVoucherDetailsText, 'Details copied')
                          }
                          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#741827]"
                        >
                          <Copy className="h-4 w-4" />
                          Copy customer details
                        </button>
                      </div>
                    </section>

                    <section className="order-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-700 text-white">
                          <Link2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-950">
                            Third-party document access
                          </p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                            Generate a coded link for suppliers or partners. They must enter the
                            code and accept the data-handling responsibility before viewing files.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-500">Label</span>
                          <input
                            value={thirdPartyShareForm.label}
                            onChange={(event) =>
                              setThirdPartyShareForm((current) => ({
                                ...current,
                                label: event.target.value,
                              }))
                            }
                            placeholder="Third-party document access"
                            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            Recipient
                          </span>
                          <input
                            value={thirdPartyShareForm.recipientName}
                            onChange={(event) =>
                              setThirdPartyShareForm((current) => ({
                                ...current,
                                recipientName: event.target.value,
                              }))
                            }
                            placeholder="Supplier or company"
                            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            Purpose
                          </span>
                          <input
                            value={thirdPartyShareForm.purpose}
                            onChange={(event) =>
                              setThirdPartyShareForm((current) => ({
                                ...current,
                                purpose: event.target.value,
                              }))
                            }
                            placeholder="Reservation handling, ticketing, supplier verification"
                            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            Expires
                          </span>
                          <input
                            type="datetime-local"
                            value={thirdPartyShareForm.expiresAt}
                            onChange={(event) =>
                              setThirdPartyShareForm((current) => ({
                                ...current,
                                expiresAt: event.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                          />
                        </label>

                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Allowed documents
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES.map((category) => {
                              const active =
                                thirdPartyShareForm.allowedCategories.includes(category)
                              return (
                                <button
                                  key={category}
                                  type="button"
                                  onClick={() => toggleThirdPartyShareCategory(category)}
                                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                                    active
                                      ? 'bg-cyan-700 text-white'
                                      : 'bg-white text-slate-600 ring-1 ring-cyan-200 hover:bg-cyan-100'
                                  }`}
                                >
                                  {getPackageDocumentCategoryLabel(category)}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void createThirdPartyShare()}
                          disabled={savingThirdPartyShare}
                          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {savingThirdPartyShare ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          Generate link/code
                        </button>
                      </div>

                      {generatedThirdPartyShare && (
                        <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3">
                          <p className="text-xs font-black uppercase text-cyan-700">
                            Ready to share
                          </p>
                          <p className="mt-2 break-all text-xs font-bold text-slate-600">
                            {generatedThirdPartyShare.shareUrl}
                          </p>
                          <p className="mt-2 text-sm font-black text-slate-950">
                            Code: {generatedThirdPartyShare.accessCode}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void copyAccessVoucherText(
                                generatedThirdPartyShareDetailsText,
                                'Third-party details copied',
                              )
                            }
                            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-800 transition hover:bg-cyan-100"
                          >
                            <Copy className="h-4 w-4" />
                            Copy share info
                          </button>
                        </div>
                      )}

                      {thirdPartyShares.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-black uppercase text-slate-500">
                            Recent shares
                          </p>
                          {thirdPartyShares.slice(0, 4).map((share) => (
                            <div
                              key={share.id}
                              className="rounded-lg border border-cyan-100 bg-white p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-slate-950">
                                    {share.label}
                                  </p>
                                  <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                    {share.recipient_name || 'No recipient'} · expires{' '}
                                    {formatDateTime(share.expires_at)}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                                    share.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {share.status}
                                </span>
                              </div>
                              {share.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => void revokeThirdPartyShare(share)}
                                  disabled={savingThirdPartyShare}
                                  className="mt-2 inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                                >
                                  <X className="h-3 w-3" />
                                  Revoke
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {accessVoucherCopyMessage && (
                      <p className="order-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-700 xl:col-start-2">
                        {accessVoucherCopyMessage}
                      </p>
                    )}
                  </aside>
                </div>
              </div>
            </div>
          )}

          {activePackageTab === 'overview' && (
            <PackageFinalQuoteSnapshot
              selectedCombination={selectedCombination}
              selectedPayload={selectedPayload}
              selectedVisaPassengerCounts={selectedVisaPassengerCounts}
              passengerSummary={passengerSummary}
              quoteTitle={quoteTitle}
              quoteCustomerName={quoteCustomerName}
              quoteCustomerPhone={quoteCustomerPhone}
              quoteCustomerEmail={quoteCustomerEmail}
              quoteDateRange={quoteDateRange}
              quoteSelectionNote={quoteSelectionNote}
              onOpenSnapshot={() => setShowQuoteSnapshot(true)}
            />
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

              {reservationNotice && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  {reservationNotice}
                </div>
              )}

              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Net booked cost</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.booked, reservationCurrency)}
                  </p>
                  {reservationTotals.supplierRefund > 0 && (
                    <p className="mt-1 text-xs font-bold text-emerald-700">
                      Supplier credits: -
                      {formatMoney(reservationTotals.supplierRefund, reservationCurrency)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Net sold price</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.sold, reservationCurrency)}
                  </p>
                  {reservationTotals.customerRefund > 0 && (
                    <p className="mt-1 text-xs font-bold text-rose-700">
                      Customer refunds: -
                      {formatMoney(reservationTotals.customerRefund, reservationCurrency)}
                    </p>
                  )}
                  {reservationTotals.discount > 0 && (
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Net after discount: {formatMoney(netReservationSold, reservationCurrency)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Discounts</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.discount, reservationCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Commission</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatMoney(reservationTotals.commission, reservationCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Profit estimate</p>
                  <p className="mt-1 text-sm font-black text-[#8b1e2d]">
                    {formatMoney(estimatedMargin, reservationCurrency)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Sold - discounts - booked + commission
                  </p>
                </div>
              </div>
              {Object.values(reservationDiscountAllocations).some(
                (allocation) => allocation.total > 0,
              ) && (
                <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-900">
                  Blue quote allocations divide the package discount between refundable services
                  using current profit weighting. The package discount adjustment remains the
                  accounting total and is not deducted twice.
                </p>
              )}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase text-slate-500">
                        {quoteReservationPrefills.length} items
                      </span>
                      <button
                        type="button"
                        onClick={() => void createAllQuoteReservations()}
                        disabled={savingReservation || quoteReservationMissingCount === 0}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {savingReservation ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Create missing from quote
                      </button>
                    </div>
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
                          {prefill.sourceLabel}
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

              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewReservationForm((current) => !current)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {showNewReservationForm ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {showNewReservationForm ? 'Hide new reservation' : 'Add new reservation'}
                </button>
              </div>

              {showNewReservationForm && (
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
                      Commission
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
                      onChange={(event) =>
                        updateReservationForm('internalNotes', event.target.value)
                      }
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
              )}

              <div className="mt-4 space-y-3">
                {reservations.length === 0 && !reservationsLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm font-bold text-slate-500">
                    No reservations added yet.
                  </div>
                ) : (
                  reservations.map((reservation) => {
                    const ReservationIcon = getReservationIcon(reservation.reservation_type)
                    const itemForm = getReservationItemForm(reservation)
                    const detailForm = getReservationDetailForm(reservation)
                    const savingThisItem = savingItemReservationId === reservation.id
                    const financialForm = getReservationFinancialForm(reservation)
                    const refundForm = getReservationRefundForm(reservation)
                    const savingFinancials = savingReservationFinancialId === reservation.id
                    const savingRefund = savingReservationRefundId === reservation.id
                    const expanded = Boolean(expandedReservationIds[reservation.id])
                    const supplierRefund = Number(reservation.supplier_refund_total || 0)
                    const customerRefund = Number(reservation.customer_refund_total || 0)
                    const quoteDiscountAllocation = reservationDiscountAllocations[reservation.id]
                    const allocatedQuoteDiscount = Number(quoteDiscountAllocation?.total || 0)
                    const netBooked = Math.max(
                      0,
                      parseMoneyInput(financialForm.bookedCostTotal) - supplierRefund,
                    )
                    const netSold =
                      parseMoneyInput(financialForm.soldPriceTotal) -
                      parseMoneyInput(financialForm.discountTotal) -
                      allocatedQuoteDiscount -
                      customerRefund
                    const reservationDifference = netSold - netBooked
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
                                {formatMoney(
                                  Math.max(
                                    0,
                                    Number(reservation.sold_price_total || 0) - customerRefund,
                                  ),
                                  reservation.currency,
                                )}{' '}
                                · Booked{' '}
                                {formatMoney(
                                  Math.max(
                                    0,
                                    Number(reservation.booked_cost_total || 0) - supplierRefund,
                                  ),
                                  reservation.currency,
                                )}
                              </p>
                              {(supplierRefund > 0 || customerRefund > 0) && (
                                <p className="mt-1 text-xs font-bold text-emerald-700">
                                  {supplierRefund > 0
                                    ? `Supplier credit ${formatMoney(supplierRefund, reservation.currency)}`
                                    : ''}
                                  {supplierRefund > 0 && customerRefund > 0 ? ' · ' : ''}
                                  {customerRefund > 0
                                    ? `Customer refunded ${formatMoney(customerRefund, reservation.currency)}`
                                    : ''}
                                </p>
                              )}
                              {allocatedQuoteDiscount > 0 && (
                                <p className="mt-1 text-xs font-bold text-sky-700">
                                  Quote discount allocated:{' '}
                                  {formatMoney(allocatedQuoteDiscount, reservation.currency)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
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
                            <button
                              type="button"
                              onClick={() => void deleteReservation(reservation)}
                              disabled={updatingReservationId === reservation.id}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <>
                            <form
                              className="mt-4 rounded-lg border border-slate-200 bg-white p-3"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void saveReservationDetails(reservation)
                              }}
                            >
                              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">
                                    Reservation details
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    Editable operational record. Supplier and booking references can
                                    be updated after reservation.
                                  </p>
                                </div>
                                <button
                                  type="submit"
                                  disabled={updatingReservationId === reservation.id}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {updatingReservationId === reservation.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  Save Details
                                </button>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Type
                                  <select
                                    value={detailForm.reservationType}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
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
                                  Title
                                  <input
                                    value={detailForm.title}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
                                        'title',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Status
                                  <select
                                    value={detailForm.status}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
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
                                    value={detailForm.supplierName}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
                                        'supplierName',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    placeholder="Supplier name"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Supplier ref
                                  <input
                                    value={detailForm.supplierReference}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
                                        'supplierReference',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    placeholder="Supplier reference"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Booking ref
                                  <input
                                    value={detailForm.bookingReference}
                                    onChange={(event) =>
                                      updateReservationDetailForm(
                                        reservation,
                                        'bookingReference',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                    placeholder="PNR, hotel ref, voucher ref"
                                  />
                                </label>
                              </div>

                              <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
                                Internal notes
                                <textarea
                                  value={detailForm.internalNotes}
                                  onChange={(event) =>
                                    updateReservationDetailForm(
                                      reservation,
                                      'internalNotes',
                                      event.target.value,
                                    )
                                  }
                                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                                />
                              </label>
                            </form>

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
                                    Edit booked cost, sold price, discount, commission, and payment
                                    due values here.
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    Profit before commission:{' '}
                                    <span className="text-[#8b1e2d]">
                                      {formatMoney(reservationDifference, reservation.currency)}
                                    </span>{' '}
                                    sold minus direct and allocated discounts, then booked cost
                                  </p>
                                  {quoteDiscountAllocation?.sources.length ? (
                                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                                      <p className="font-black">
                                        Automatically allocated quote discount
                                      </p>
                                      {quoteDiscountAllocation.sources.map((source) => (
                                        <p
                                          key={`${source.offerId}-${source.discountType}`}
                                          className="mt-1"
                                        >
                                          {source.title}:{' '}
                                          {formatMoney(source.amount, reservation.currency)}
                                        </p>
                                      ))}
                                      <p className="mt-1 text-sky-700">
                                        Profit basis:{' '}
                                        {formatMoney(
                                          quoteDiscountAllocation.basisProfit,
                                          reservation.currency,
                                        )}
                                        {' · '}quote discount share:{' '}
                                        {quoteDiscountAllocation.allocationPercentage.toFixed(2)}%
                                      </p>
                                    </div>
                                  ) : null}
                                  {parseMoneyInput(financialForm.commissionExpectedTotal) > 0 && (
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                      Profit with commission:{' '}
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
                                <label className="rounded-lg border border-[#8b1e2d]/20 bg-white p-2 text-xs font-bold uppercase text-slate-500">
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
                                  Direct / manual discount
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
                                  Commission
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

                            <form
                              className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 p-3"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void recordReservationRefund(reservation)
                              }}
                            >
                              <div className="mb-3 flex items-start gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                                  <RotateCcw className="h-4 w-4" />
                                </span>
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-700">
                                    Record refund or supplier credit
                                  </p>
                                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                                    Enter a positive amount. Supplier credits reduce booked cost;
                                    customer refunds are capped after direct and allocated quote
                                    discounts, then added to Payments.
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Refund type
                                  <select
                                    value={refundForm.refundKind}
                                    onChange={(event) =>
                                      updateReservationRefundForm(
                                        reservation,
                                        'refundKind',
                                        event.target.value as 'supplier' | 'customer',
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                                  >
                                    <option value="supplier">Supplier credit / refund</option>
                                    <option value="customer">Customer refund</option>
                                  </select>
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Amount
                                  <input
                                    type="number"
                                    min="0.01"
                                    max={Math.max(
                                      0,
                                      refundForm.refundKind === 'supplier'
                                        ? parseMoneyInput(financialForm.bookedCostTotal) -
                                            supplierRefund
                                        : parseMoneyInput(financialForm.soldPriceTotal) -
                                            parseMoneyInput(financialForm.discountTotal) -
                                            allocatedQuoteDiscount -
                                            customerRefund,
                                    )}
                                    step="0.01"
                                    required
                                    value={refundForm.amount}
                                    onChange={(event) =>
                                      updateReservationRefundForm(
                                        reservation,
                                        'amount',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                                    placeholder="0.00"
                                  />
                                </label>

                                {refundForm.refundKind === 'customer' && (
                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    Refund method
                                    <select
                                      value={refundForm.paymentMethod}
                                      onChange={(event) =>
                                        updateReservationRefundForm(
                                          reservation,
                                          'paymentMethod',
                                          event.target
                                            .value as ReservationRefundFormState['paymentMethod'],
                                        )
                                      }
                                      className="mt-1 min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                                    >
                                      <option value="cash">Cash</option>
                                      <option value="bank_transfer">Bank transfer</option>
                                      <option value="card">Credit card</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </label>
                                )}

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Reference
                                  <input
                                    value={refundForm.reference}
                                    onChange={(event) =>
                                      updateReservationRefundForm(
                                        reservation,
                                        'reference',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                                    placeholder="Supplier or bank reference"
                                  />
                                </label>

                                <label className="text-xs font-bold uppercase text-slate-500">
                                  Reason
                                  <input
                                    value={refundForm.reason}
                                    onChange={(event) =>
                                      updateReservationRefundForm(
                                        reservation,
                                        'reason',
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                                    placeholder="Cancellation or refund reason"
                                  />
                                </label>
                              </div>

                              <div className="mt-3 flex flex-col gap-2 border-t border-rose-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs font-bold text-slate-600">
                                  Recorded: supplier{' '}
                                  {formatMoney(supplierRefund, reservation.currency)}
                                  {' · '}customer{' '}
                                  {formatMoney(customerRefund, reservation.currency)}
                                  {' · '}customer refundable{' '}
                                  {formatMoney(
                                    Math.max(
                                      0,
                                      parseMoneyInput(financialForm.soldPriceTotal) -
                                        parseMoneyInput(financialForm.discountTotal) -
                                        allocatedQuoteDiscount -
                                        customerRefund,
                                    ),
                                    reservation.currency,
                                  )}
                                </p>
                                <button
                                  type="submit"
                                  disabled={savingRefund}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 text-xs font-black text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {savingRefund ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  Record refund
                                </button>
                              </div>
                            </form>

                            {reservation.internal_notes && (
                              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                {reservation.internal_notes}
                              </p>
                            )}

                            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">
                                    Line items
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-slate-500">
                                    Optional breakdown rows for rooms, sectors, visas, transfers, or
                                    commissions. Saved rows roll up into this reservation.
                                  </p>
                                </div>
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

              {groupInvoiceFamilies.length > 0 && (
                <div className="mb-4 border-y-4 border-cyan-900 bg-cyan-50 p-3 sm:rounded-lg sm:border-x">
                  <p className="text-xs font-black uppercase text-cyan-900">Family invoices</p>
                  <p className="mt-1 text-sm text-slate-600">
                    This is one customer file. Select a family to create or edit its separate
                    invoice and balance.
                  </p>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {groupInvoiceFamilies.map((family) => (
                      <button
                        key={family.quoteId}
                        type="button"
                        onClick={() => {
                          setInvoice(null)
                          setInvoiceForm(createInitialInvoiceForm())
                          setSelectedInvoiceQuoteId(family.quoteId)
                        }}
                        className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                          selectedInvoiceQuoteId === family.quoteId
                            ? 'bg-cyan-900 text-white'
                            : 'border border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-100'
                        }`}
                      >
                        {family.familyLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    <button
                      type="button"
                      onClick={() => setShowInvoicePreview(true)}
                      disabled={!invoice}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Eye className="h-4 w-4" />
                      Preview Invoice
                    </button>
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

      <PackageOverviewDialogs
        showAccessVoucher={showAccessVoucher}
        setShowAccessVoucher={setShowAccessVoucher}
        accessVoucherQr={accessVoucherQr}
        accessVoucherCopyMessage={accessVoucherCopyMessage}
        accessVoucherDetailsText={accessVoucherDetailsText}
        copyAccessVoucherText={copyAccessVoucherText}
        printStandaloneAccessVoucher={printStandaloneAccessVoucher}
        quoteCustomerFirstName={quoteCustomerFirstName}
        quoteCustomerLastName={quoteCustomerLastName}
        showQuoteSnapshot={showQuoteSnapshot}
        setShowQuoteSnapshot={setShowQuoteSnapshot}
        selectedCombination={selectedCombination}
        selectedPayload={selectedPayload}
        selectedVisaPassengerCounts={selectedVisaPassengerCounts}
        passengerSummary={passengerSummary}
        quoteTitle={quoteTitle}
        quoteDateRange={quoteDateRange}
        quoteCustomerName={quoteCustomerName}
        quoteCustomerPhone={quoteCustomerPhone}
        quoteCustomerEmail={quoteCustomerEmail}
        quoteSelectionNote={quoteSelectionNote}
        packageFolder={packageFolder}
        showInvoicePreview={showInvoicePreview}
        setShowInvoicePreview={setShowInvoicePreview}
        invoice={invoice}
        invoicePreviewLines={invoicePreviewLines}
        invoicePreviewDueDate={invoicePreviewDueDate}
        invoiceCurrency={invoiceCurrency}
        invoiceSubtotalSold={invoiceSubtotalSold}
        invoiceDiscountTotal={invoiceDiscountTotal}
        invoiceTotalSold={invoiceTotalSold}
        invoiceTotalPaid={invoiceTotalPaid}
        invoiceBalanceDue={invoiceBalanceDue}
        invoiceForm={invoiceForm}
        photoLinkDocument={photoLinkDocument}
        setPhotoLinkDocument={setPhotoLinkDocument}
        savingDocument={savingDocument}
        draggingDocumentCategory={draggingDocumentCategory}
        setDraggingDocumentCategory={setDraggingDocumentCategory}
        uploadVisaPhotoFiles={uploadVisaPhotoFiles}
        visaPhotosByTravelDocumentId={visaPhotosByTravelDocumentId}
        previewDocument={previewDocument}
        setPreviewDocument={setPreviewDocument}
        previewDocumentUrl={previewDocumentUrl}
        setPreviewDocumentUrl={setPreviewDocumentUrl}
        previewDocumentLoading={previewDocumentLoading}
        previewDocumentIsImage={previewDocumentIsImage}
        previewDocumentIsPdf={previewDocumentIsPdf}
      />
    </div>
  )
}
