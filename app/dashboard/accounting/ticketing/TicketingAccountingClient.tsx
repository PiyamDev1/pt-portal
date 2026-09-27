'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CirclePoundSterling,
  Maximize2,
  Plane,
  ReceiptPoundSterling,
  RefreshCw,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import {
  TICKETING_SERVICE_LABELS,
  type AccountingTicketingReport,
  type TicketingReportRow,
  type TicketingReportSection,
  type TicketingServiceType,
} from '@/lib/accounting/ticketingReports'

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})
const CURRENT_YEAR = new Date().getUTCFullYear()
const CURRENT_MONTH = new Date().getUTCMonth()
const YEAR_OPTIONS = Array.from({ length: 12 }, (_, index) => CURRENT_YEAR - index)

type SelectedDetails = {
  section: TicketingReportSection
  row: TicketingReportRow
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
}: {
  icon: typeof Ticket
  label: string
  value: string
  detail: string
  tone?: 'slate' | 'emerald' | 'rose'
}) {
  const tones = {
    slate: 'border-slate-200 bg-white',
    emerald: 'border-emerald-200 bg-emerald-50/60',
    rose: 'border-rose-200 bg-rose-50/60',
  }
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-3 text-xl font-black tabular-nums text-slate-950 sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function DetailsModal({
  selected,
  monthIndex,
  monthLabel,
  onClose,
}: {
  selected: SelectedDetails | null
  monthIndex: number
  monthLabel: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!selected) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, selected])

  if (!selected) return null
  const monthNumber = monthIndex + 1
  const tickets = selected.row.tickets.filter(
    (ticket) => new Date(`${ticket.bookingDate}T12:00:00Z`).getUTCMonth() + 1 === monthNumber,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <button aria-label="Close ticket details" className="absolute inset-0" onClick={onClose} />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
              {selected.section.branch.name} - {monthLabel}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {selected.row.airlineCode} - {selected.row.airlineName}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Sale - supplier cost = gross margin. Refunds and staff commission are not deducted
              here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Booking</th>
                <th className="px-3 py-3">Customer / agent</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Passengers</th>
                <th className="px-3 py-3 text-right">Sale</th>
                <th className="px-3 py-3 text-right">Supplier</th>
                <th className="px-5 py-3 text-right">Calculation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-black text-slate-950">{ticket.pnr}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {new Date(`${ticket.bookingDate}T12:00:00Z`).toLocaleDateString('en-GB')} -{' '}
                      {TICKETING_SERVICE_LABELS[ticket.serviceType]}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-800">{ticket.customerName}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{ticket.ownerName}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold capitalize text-slate-700">
                      {ticket.operationalStatus}
                    </p>
                    <p
                      className={`mt-1 text-[10px] font-black uppercase ${
                        ticket.paymentStatus.toLowerCase() === 'paid'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {ticket.paymentStatus.replace(/_/g, ' ')}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">
                    {ticket.passengerCount.toLocaleString('en-GB')}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">
                    {GBP.format(ticket.saleGbp)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">
                    {GBP.format(ticket.supplierCostGbp)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <p
                      className={`font-mono font-black ${ticket.grossProfitGbp >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                    >
                      {GBP.format(ticket.saleGbp)} - {GBP.format(ticket.supplierCostGbp)} ={' '}
                      {GBP.format(ticket.grossProfitGbp)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tickets.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              No {selected.row.airlineCode} transactions in {monthLabel}.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function BranchSection({
  section,
  monthIndex,
  monthLabel,
  onOpen,
}: {
  section: TicketingReportSection
  monthIndex: number
  monthLabel: string
  onOpen: (details: SelectedDetails) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-black text-slate-950">{section.branch.name}</h2>
            <p className="text-xs text-slate-500">
              {section.branch.branchCode || 'No branch code'} - {section.transactions} transactions
              in report
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
          <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            {section.passengerTickets} passengers
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 ${
              section.grossProfitGbp >= 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {GBP.format(section.grossProfitGbp)} gross margin
          </span>
        </div>
      </header>
      {section.rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No ticketing transactions were recorded for this branch in the selected year.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Airline</th>
                <th className="px-3 py-3 text-right">{monthLabel}</th>
                <th className="px-3 py-3 text-right">Passengers</th>
                <th className="px-3 py-3 text-right">Sales</th>
                <th className="px-3 py-3 text-right">Supplier cost</th>
                <th className="px-3 py-3 text-right">Gross margin</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {section.rows.map((row) => {
                const monthTransactions = row.monthlyTransactions[monthIndex]
                return (
                  <tr key={`${row.airlineCode}-${row.airlineName}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-black text-slate-950">{row.airlineCode}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{row.airlineName}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-950">
                      {monthTransactions.toLocaleString('en-GB')}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">
                      {row.monthlyPassengerTickets[monthIndex].toLocaleString('en-GB')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">
                      {GBP.format(row.monthlySaleGbp[monthIndex])}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">
                      {GBP.format(row.monthlySupplierCostGbp[monthIndex])}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono font-black ${
                        row.monthlyGrossProfitGbp[monthIndex] >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {GBP.format(row.monthlyGrossProfitGbp[monthIndex])}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={monthTransactions === 0}
                        onClick={() => onOpen({ section, row })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-black text-slate-700 hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Maximize2 className="h-3.5 w-3.5" /> {monthTransactions}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function LoadingReport() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl bg-white ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-white ring-1 ring-slate-200" />
      <div className="h-72 rounded-xl bg-white ring-1 ring-slate-200" />
    </div>
  )
}

export default function TicketingAccountingClient() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [branchId, setBranchId] = useState<string | 'all'>('all')
  const [service, setService] = useState<TicketingServiceType | 'all'>('all')
  const [monthIndex, setMonthIndex] = useState(CURRENT_MONTH)
  const [report, setReport] = useState<AccountingTicketingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<SelectedDetails | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ year: String(year), branchId, service })
        const response = await fetch(`/api/accounting/ticketing?${params}`, {
          signal: controller.signal,
        })
        const payload = (await response.json()) as AccountingTicketingReport & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load ticketing report')
        setReport(payload)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Unable to load ticketing report',
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [branchId, refreshKey, service, year])

  const month = report?.months[monthIndex]
  const maxTransactions = useMemo(
    () => Math.max(...(report?.months.map((item) => item.transactions) || [0]), 1),
    [report],
  )

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Link href="/dashboard/accounting" className="hover:text-emerald-700">
              Accounting
            </Link>
            <span>/</span>
            <span>Ticketing</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Ticketing Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live ticket sales, supplier costs and gross margin by recorded booking branch
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Report year</span>
            <select
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value)
                setYear(nextYear)
                setMonthIndex(nextYear === CURRENT_YEAR ? CURRENT_MONTH : 0)
              }}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="h-10 rounded-lg border border-slate-200 bg-white px-3">
            <span className="sr-only">Branch</span>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-full bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              <option value="all">All live branches</option>
              {report?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.branchCode ? ` - ${branch.branchCode}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="h-10 rounded-lg border border-slate-200 bg-white px-3">
            <span className="sr-only">Ticketing service</span>
            <select
              value={service}
              onChange={(event) => setService(event.target.value as TicketingServiceType | 'all')}
              className="h-full bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              <option value="all">All ticketing services</option>
              {Object.entries(TICKETING_SERVICE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            aria-label="Refresh ticketing report"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="font-black"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!report && loading ? (
        <LoadingReport />
      ) : report ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric
              icon={Ticket}
              label="Transactions"
              value={report.totals.transactions.toLocaleString('en-GB')}
              detail={`${report.totals.paid} paid - ${report.totals.partial} partial - ${report.totals.unpaid} unpaid`}
            />
            <Metric
              icon={Users}
              label="Passenger tickets"
              value={report.totals.passengerTickets.toLocaleString('en-GB')}
              detail={`${report.totals.held} held transactions`}
            />
            <Metric
              icon={ReceiptPoundSterling}
              label="Recorded sales"
              value={GBP.format(report.totals.saleGbp)}
              detail={`During ${report.year}`}
            />
            <Metric
              icon={CirclePoundSterling}
              label="Supplier cost"
              value={GBP.format(report.totals.supplierCostGbp)}
              detail="From ticket fare lines"
            />
            <Metric
              icon={Plane}
              label="Gross margin"
              value={GBP.format(report.totals.grossProfitGbp)}
              detail="Sales minus supplier cost"
              tone={report.totals.grossProfitGbp >= 0 ? 'emerald' : 'rose'}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-black text-slate-900">Monthly transactions</h2>
              </div>
              <p className="text-xs font-bold text-slate-500">
                {month?.label || 'Month'}: {month?.transactions || 0} transactions -{' '}
                {GBP.format(month?.grossProfitGbp || 0)} gross margin
              </p>
            </div>
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="grid min-w-[720px] grid-cols-12 gap-2">
                {report.months.map((item, index) => {
                  const selectedMonth = index === monthIndex
                  const height =
                    item.transactions === 0
                      ? 3
                      : Math.max(10, (item.transactions / maxTransactions) * 78)
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMonthIndex(index)}
                      aria-pressed={selectedMonth}
                      className={`flex h-32 flex-col items-center justify-end rounded-lg border px-1 pb-2 transition ${
                        selectedMonth
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className="mb-1 text-xs font-black text-slate-800">
                        {item.transactions}
                      </span>
                      <span
                        className={`w-full max-w-7 rounded-t ${selectedMonth ? 'bg-emerald-600' : 'bg-slate-400'}`}
                        style={{ height: `${height}px` }}
                      />
                      <span className="mt-2 text-[11px] font-bold text-slate-600">
                        {item.shortLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
            Gross margin is calculated from the GBP sale and supplier totals saved on each fare
            line. Refunds, replacement-case adjustments and staff commission remain separate until
            their accounting treatment is finalised.
          </p>

          <div className="space-y-4">
            {report.sections.map((section) => (
              <BranchSection
                key={section.branch.id}
                section={section}
                monthIndex={monthIndex}
                monthLabel={month?.label || 'Selected month'}
                onOpen={setSelected}
              />
            ))}
          </div>

          <DetailsModal
            selected={selected}
            monthIndex={monthIndex}
            monthLabel={month?.label || 'Selected month'}
            onClose={() => setSelected(null)}
          />
        </>
      ) : null}
    </div>
  )
}
