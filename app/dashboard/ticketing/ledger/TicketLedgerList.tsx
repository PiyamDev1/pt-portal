import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  PackageCheck,
  PencilLine,
  PlaneTakeoff,
  TriangleAlert,
  UserRoundCheck,
  UserRoundCog,
  Trash2,
} from 'lucide-react'
import type { TicketChangeRequestType, TicketLedgerItem, TicketPassengerType } from './types'

const PASSENGER_TYPES: TicketPassengerType[] = ['ADT', 'YTH', 'CHD', 'INF']

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusTone(status: string) {
  switch (status.toLowerCase()) {
    case 'issued':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'held':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'expired':
    case 'cancelled':
    case 'refunded':
      return 'bg-red-50 text-red-800 ring-red-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200'
  }
}

function paymentTone(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'part_paid':
      return 'bg-sky-50 text-sky-800 ring-sky-200'
    default:
      return 'bg-amber-50 text-amber-800 ring-amber-200'
  }
}

function formatDate(value: string | null, timezone: string, includeTime = false) {
  if (!value) return 'Not set'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date)
}

function passengerMix(item: TicketLedgerItem) {
  const quantities = new Map(item.fares.map((fare) => [fare.passengerType, fare.quantity]))
  const parts = PASSENGER_TYPES.flatMap((type) => {
    const quantity = Number(quantities.get(type) || 0)
    return quantity > 0 ? [`${quantity} ${type}`] : []
  })
  return parts.length > 0 ? parts.join(' · ') : `${item.passengerCount} passenger(s)`
}

function PackageBadge({ status }: { status: string }) {
  if (status === 'matched' || status === 'manually_resolved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Package linked
      </span>
    )
  }
  if (status === 'ambiguous') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-800 ring-1 ring-orange-200">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Package needs review
      </span>
    )
  }
  return null
}

export function TicketLedgerList({
  items,
  employeeId,
  currentTimeMs,
  onComplete,
  onMarkPaid,
  onEditItinerary,
  canManageRecords = false,
  canManageAttribution,
  canArchiveRecords,
  onCorrectAttribution,
  onCorrectDates = () => undefined,
  onArchive,
  onRequestChange,
}: {
  items: TicketLedgerItem[]
  timezone?: string
  employeeId: string
  currentTimeMs: number
  onComplete: (item: TicketLedgerItem) => void
  onMarkPaid: (item: TicketLedgerItem) => void
  onEditItinerary: (item: TicketLedgerItem) => void
  canManageRecords?: boolean
  canManageAttribution: boolean
  canArchiveRecords: boolean
  onCorrectAttribution: (item: TicketLedgerItem) => void
  onCorrectDates?: (item: TicketLedgerItem) => void
  onArchive: (item: TicketLedgerItem) => void
  onRequestChange: (item: TicketLedgerItem, requestType: TicketChangeRequestType) => void
}) {
  if (items.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <CalendarClock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="mt-3 text-base font-black text-slate-900">No matching tickets</h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Save a TK above, or clear the current ledger filters.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[0.8fr_1.3fr_0.8fr_1.35fr_2.4fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 lg:grid">
        <span>PNR / airline</span>
        <span>Customer</span>
        <span>Passengers</span>
        <span>Status</span>
        <span>Details</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const usesDeadline =
            item.operationalStatus === 'held' ||
            (item.operationalStatus === 'cancelled' && item.issuedAt === null)
          const keyDate = usesDeadline ? item.timeLimitAt : item.issuedAt
          const keyDateLabel = usesDeadline ? 'Time limit' : 'Issued'
          const isResponsibleEmployee = item.responsibleEmployee.id === employeeId
          const isOverdue =
            item.operationalStatus === 'held' &&
            item.timeLimitAt !== null &&
            new Date(item.timeLimitAt).getTime() <= currentTimeMs
          return (
            <article
              key={item.transactionId}
              className="grid gap-3 px-4 py-3 transition hover:bg-slate-50/70 lg:grid-cols-[0.8fr_1.3fr_0.8fr_1.35fr_2.4fr] lg:items-center"
            >
              <div className="flex items-start justify-between gap-3 lg:block">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-base font-black tracking-wide text-slate-950">
                      {item.pnr}
                    </p>
                    <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[9px] font-black text-white">
                      {item.serviceType}
                    </span>
                    {item.commercialTreatment === 'commission_waived' && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-900 ring-1 ring-amber-200">
                        No commission
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-bold text-slate-500">
                    {item.airline.iataCode} · {item.airline.name}
                  </p>
                  {item.supplier && (
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                      Supplier: {item.supplier.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{item.customerName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Booked {formatDate(item.bookingDate, item.locationTimezone)}
                </p>
                <div className="mt-2 space-y-0.5 border-l-2 border-sky-200 pl-2">
                  <p className="truncate text-[11px] font-bold text-slate-700">
                    {item.serviceType === 'TK' ? 'Responsible' : 'Booking owner'}:{' '}
                    {item.responsibleEmployee.fullName}
                  </p>
                  {item.serviceType === 'TK' && item.assistantEmployees.length > 0 && (
                    <p className="truncate text-[11px] font-semibold text-slate-500">
                      Assisted by:{' '}
                      {item.assistantEmployees.map((employee) => employee.fullName).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800">{passengerMix(item)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.passengerCount} ticket(s)</p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusTone(item.operationalStatus)}`}
                  >
                    {titleCase(item.operationalStatus)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${paymentTone(item.paymentStatus)}`}
                  >
                    {titleCase(item.paymentStatus)}
                  </span>
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-800 ring-1 ring-red-200">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Overdue action
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    {keyDateLabel}
                  </p>
                  {canManageRecords &&
                  ['held', 'issued', 'cancelled', 'part_refunded', 'refunded'].includes(
                    item.operationalStatus,
                  ) ? (
                    <button
                      type="button"
                      onClick={() => onCorrectDates(item)}
                      aria-label={`Correct ${usesDeadline ? 'airline deadline' : 'issued date'} for ${item.pnr}`}
                      className="ui-focus mt-0.5 inline-flex items-center gap-1 rounded-md text-left text-xs font-semibold text-sky-700 underline decoration-dotted underline-offset-2 hover:text-[#8b1e2d]"
                    >
                      {formatDate(keyDate, item.locationTimezone, usesDeadline)}
                      <PencilLine className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : (
                    <p className="mt-0.5 text-xs font-semibold text-slate-700">
                      {formatDate(keyDate, item.locationTimezone, usesDeadline)}
                    </p>
                  )}
                </div>
                <div>
                  <PackageBadge status={item.packageMatchStatus} />
                  {item.packageMatchStatus === 'unmatched' && (
                    <span className="text-xs font-semibold text-slate-400">Standard ticket</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-2">
                <div className="flex flex-wrap items-center gap-2 self-start">
                  <span
                    className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                      item.detailsStatus === 'recorded'
                        ? 'bg-violet-50 text-violet-800 ring-violet-200'
                        : item.detailsStatus === 'complete'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                          : 'bg-amber-50 text-amber-800 ring-amber-200'
                    }`}
                  >
                    {item.detailsStatus === 'recorded' || item.detailsStatus === 'complete' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {item.detailsStatus === 'recorded'
                      ? 'Service recorded'
                      : item.detailsStatus === 'complete'
                        ? 'Complete'
                        : 'Needs details'}
                  </span>
                  {item.commercialTreatment === 'staff_family' && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-900 ring-1 ring-amber-200">
                      Staff/Family
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {item.serviceType === 'TK' ? (
                    <>
                      {isResponsibleEmployee ? (
                        <button
                          type="button"
                          onClick={() =>
                            item.detailsStatus === 'complete' && !canManageAttribution
                              ? onRequestChange(item, 'amendment')
                              : onComplete(item)
                          }
                          aria-label={`${item.detailsStatus === 'complete' && !canManageAttribution ? 'Request amendment to' : item.detailsStatus === 'complete' ? 'Edit' : 'Complete'} details for ${item.pnr}`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 text-center text-xs font-black leading-tight text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
                        >
                          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.detailsStatus === 'complete' && !canManageAttribution
                            ? 'Request amendment'
                            : item.detailsStatus === 'complete'
                              ? 'Edit details'
                              : 'Complete details'}
                        </button>
                      ) : canManageAttribution ? (
                        <button
                          type="button"
                          onClick={() => onComplete(item)}
                          aria-label={`${item.detailsStatus === 'complete' ? 'Edit' : 'Complete'} details for ${item.pnr} on behalf of ${item.responsibleEmployee.fullName}`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2 text-center text-xs font-black leading-tight text-violet-800 hover:bg-violet-100"
                        >
                          <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.detailsStatus === 'complete'
                            ? 'Edit on behalf'
                            : 'Complete on behalf'}
                        </button>
                      ) : (
                        <p className="col-span-full rounded-xl bg-slate-100 px-3 py-2 text-center text-[11px] font-semibold text-slate-600">
                          Details handled by {item.responsibleEmployee.fullName}
                        </p>
                      )}
                      {canManageAttribution && (
                        <button
                          type="button"
                          onClick={() => onCorrectAttribution(item)}
                          aria-label={`Correct staff attribution for ${item.pnr}`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 text-center text-xs font-black leading-tight text-sky-800 hover:bg-sky-100"
                        >
                          <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
                          Correct staff
                        </button>
                      )}
                      {(item.operationalStatus === 'held' ||
                        item.operationalStatus === 'issued') && (
                        <button
                          type="button"
                          onClick={() => onEditItinerary(item)}
                          aria-label={`Edit itinerary for ${item.pnr}`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2 text-center text-xs font-black leading-tight text-violet-800 hover:bg-violet-100"
                        >
                          <PlaneTakeoff className="h-3.5 w-3.5" aria-hidden="true" />
                          Itinerary
                        </button>
                      )}
                      {(isResponsibleEmployee || canManageAttribution) && (
                        <button
                          type="button"
                          onClick={() =>
                            canArchiveRecords ? onArchive(item) : onRequestChange(item, 'deletion')
                          }
                          aria-label={`${canArchiveRecords ? 'Delete' : 'Request deletion of'} ticket ${item.pnr}`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2 text-center text-xs font-black leading-tight text-red-800 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {canArchiveRecords ? 'Delete' : 'Request deletion'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {item.paymentStatus === 'unpaid' && isResponsibleEmployee ? (
                        <button
                          type="button"
                          onClick={() => onMarkPaid(item)}
                          aria-label={`Mark ${item.serviceType} for ${item.pnr} as paid`}
                          className="ui-tap ui-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-center text-xs font-black leading-tight text-emerald-800 hover:bg-emerald-100"
                        >
                          <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                          Mark paid
                        </button>
                      ) : (
                        <p className="col-span-full text-center text-[11px] font-semibold text-slate-500">
                          {item.paymentStatus === 'unpaid'
                            ? `Payment handled by ${item.responsibleEmployee.fullName}`
                            : 'Financial service entry'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
