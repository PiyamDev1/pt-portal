'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgePoundSterling,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  CreditCard,
  FileText,
  FolderOpen,
  Loader2,
  PackageCheck,
  Plane,
  Plus,
  ShieldCheck,
  Stamp,
  Users,
} from 'lucide-react'
import type {
  TravelPackageFolder,
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'

type PackageOverviewClientProps = {
  packageId: string
}

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

function createInitialReservationForm(): ReservationFormState {
  return {
    reservationType: 'flight',
    title: '',
    status: 'reservation_pending',
    supplierName: '',
    supplierReference: '',
    bookedCostTotal: '',
    soldPriceTotal: '',
    discountTotal: '',
    commissionExpectedTotal: '',
    depositRequired: false,
    depositAmount: '',
    paymentDueAt: '',
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

function formatReservationStatus(status: string) {
  return status.replace(/_/g, ' ')
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
  const [reservationForm, setReservationForm] = useState<ReservationFormState>(() =>
    createInitialReservationForm(),
  )
  const [itemForms, setItemForms] = useState<Record<string, ReservationItemFormState>>({})
  const [loading, setLoading] = useState(true)
  const [reservationsLoading, setReservationsLoading] = useState(false)
  const [savingReservation, setSavingReservation] = useState(false)
  const [savingItemReservationId, setSavingItemReservationId] = useState<string | null>(null)
  const [updatingReservationId, setUpdatingReservationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reservationError, setReservationError] = useState<string | null>(null)

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
              next[reservation.id] = createInitialReservationItemForm(
                reservation.reservation_type,
              )
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

  const selectedCombination = packageFolder?.selected_quote_snapshot.selection?.combination
  const passengerSummary = packageFolder?.passenger_summary
  const dateRange = useMemo(() => {
    if (!packageFolder) return 'Dates not set'
    return `${formatDate(packageFolder.departure_date)} to ${formatDate(packageFolder.return_date)}`
  }, [packageFolder])
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
  const estimatedMargin =
    reservationTotals.sold
    - reservationTotals.discount
    - reservationTotals.booked
    + reservationTotals.commission

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
      setReservationForm(createInitialReservationForm())
    } catch (saveError) {
      setReservationError(
        saveError instanceof Error ? saveError.message : 'Failed to create reservation',
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
    } catch (updateError) {
      setReservationError(
        updateError instanceof Error ? updateError.message : 'Failed to update reservation',
      )
    } finally {
      setUpdatingReservationId(null)
    }
  }

  const getReservationItemForm = (reservation: TravelPackageReservation) => {
    return (
      itemForms[reservation.id]
      || createInitialReservationItemForm(reservation.reservation_type)
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
        ...(current[reservation.id] || createInitialReservationItemForm(reservation.reservation_type)),
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
              This is the operational workspace created from the finalised quote. Reservations,
              documents, invoices, and payment plans will attach here as the next phases are built.
            </p>
          </div>
          {packageFolder.source_quote_id && (
            <Link
              href={`/dashboard/packages/quotations/${packageFolder.source_quote_id}/edit`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              Open Source Quote
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard icon={PackageCheck} label="Package status" value={packageFolder.status} />
        <StatusCard icon={ShieldCheck} label="Passports" value={packageFolder.passport_status} />
        <StatusCard icon={CreditCard} label="Payment" value={packageFolder.payment_status} />
        <StatusCard icon={FileText} label="Invoice" value={packageFolder.invoice_status} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
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

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <FolderOpen className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-black text-slate-950">Final quote snapshot</h2>
            </div>
            {selectedCombination ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">
                  {formatMoney(selectedCombination.totalPrice, selectedCombination.currency)}
                </p>
                <p className="mt-1 text-xs font-bold text-[#8b1e2d]">
                  {formatMoney(selectedCombination.perPersonPrice, selectedCombination.currency)} per
                  hotel-paying guest
                </p>
                {selectedCombination.offerDiscountTotal > 0 && (
                  <p className="mt-1 text-xs font-bold text-emerald-700">
                    Discount applied:{' '}
                    {formatMoney(
                      selectedCombination.offerDiscountTotal,
                      selectedCombination.currency,
                    )}
                  </p>
                )}
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  {selectedCombination.flightOption && (
                    <p>
                      <span className="font-bold text-slate-800">Flight:</span>{' '}
                      {selectedCombination.flightOption.title}
                    </p>
                  )}
                  {selectedCombination.visaOption && (
                    <p>
                      <span className="font-bold text-slate-800">Visa:</span>{' '}
                      {selectedCombination.visaOption.title}
                    </p>
                  )}
                  {selectedCombination.transportOption && (
                    <p>
                      <span className="font-bold text-slate-800">Transport:</span>{' '}
                      {selectedCombination.transportOption.title}
                    </p>
                  )}
                  {selectedCombination.staySelections.map((stay) => (
                    <p key={stay.groupId}>
                      <span className="font-bold text-slate-800">{stay.groupLabel}:</span>{' '}
                      {stay.option.title}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No selected quote snapshot found.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <BadgePoundSterling className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-black text-slate-950">Reservations</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Internal booking records for flights, hotels, visas, and transport. These are not
                  shown to customers unless a later customer release step makes them visible.
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
                <p className="text-xs font-bold uppercase text-slate-500">Margin estimate</p>
                <p className="mt-1 text-sm font-black text-[#8b1e2d]">
                  {formatMoney(estimatedMargin, reservationCurrency)}
                </p>
              </div>
            </div>

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
                    onChange={(event) => updateReservationForm('supplierName', event.target.value)}
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
                    onChange={(event) => updateReservationForm('soldPriceTotal', event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>

                <label className="text-xs font-bold uppercase text-slate-500">
                  Discount
                  <input
                    value={reservationForm.discountTotal}
                    onChange={(event) => updateReservationForm('discountTotal', event.target.value)}
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
                    onChange={(event) => updateReservationForm('depositAmount', event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-[#8b1e2d]/20"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>

                <label className="text-xs font-bold uppercase text-slate-500">
                  Payment due
                  <input
                    value={reservationForm.paymentDueAt}
                    onChange={(event) => updateReservationForm('paymentDueAt', event.target.value)}
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
                  return (
                    <div
                      key={reservation.id}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                            <ReservationIcon className="h-4 w-4" />
                          </span>
                          <div>
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

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Booked</p>
                          <p className="text-sm font-black text-slate-950">
                            {formatMoney(reservation.booked_cost_total, reservation.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Sold</p>
                          <p className="text-sm font-black text-slate-950">
                            {formatMoney(reservation.sold_price_total, reservation.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Discount</p>
                          <p className="text-sm font-black text-slate-950">
                            {formatMoney(reservation.discount_total, reservation.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Commission</p>
                          <p className="text-sm font-black text-slate-950">
                            {formatMoney(
                              reservation.commission_expected_total,
                              reservation.currency,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Deposit</p>
                          <p className="text-sm font-black text-slate-950">
                            {reservation.deposit_required
                              ? formatMoney(reservation.deposit_amount, reservation.currency)
                              : 'Not required'}
                          </p>
                        </div>
                      </div>

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
                                  <p className="font-black text-slate-950">{lineItem.title}</p>
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
                                  <p className="font-black text-slate-800">{lineItem.quantity}</p>
                                </div>
                                <div>
                                  <p className="font-bold uppercase text-slate-400">Booked</p>
                                  <p className="font-black text-slate-800">
                                    {formatMoney(lineItem.total_booked_cost, lineItem.currency)}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-bold uppercase text-slate-400">Sold</p>
                                  <p className="font-black text-slate-800">
                                    {formatMoney(lineItem.total_sold_price, lineItem.currency)}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-bold uppercase text-slate-400">Commission</p>
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
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

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
                Adults:{' '}
                <span className="font-black">{passengerSummary?.adults ?? 0}</span>
              </p>
              <p>
                Children 5-12:{' '}
                <span className="font-black">{passengerSummary?.childrenPaying ?? 0}</span>
              </p>
              <p>
                Under 5:{' '}
                <span className="font-black">{passengerSummary?.childrenFree ?? 0}</span>
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
      </section>
    </div>
  )
}
