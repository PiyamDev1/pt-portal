/**
 * Team Timeclock Client
 * Manager-facing attendance operations: scoped event listing,
 * filtering, pagination, and one-time timestamp adjustments.
 */
'use client'

import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TeamAdjustmentModal } from './components/TeamAdjustmentModal'
import { TeamEventsTable } from './components/TeamEventsTable'
import { TeamFiltersBar } from './components/TeamFiltersBar'

type EmployeeOption = {
  id: string
  name: string
}

type TimeclockEvent = {
  id: string
  employee_id?: string
  event_type: string
  punch_type?: string
  device_ts: string
  scanned_at: string
  adjusted_device_ts?: string | null
  adjusted_scanned_at?: string | null
  adjusted_at?: string | null
  adjustment_reason?: string | null
  geo?: { lat?: number; lng?: number; accuracy?: number } | null
  employees?: { full_name?: string } | { full_name?: string }[] | null
  timeclock_devices?: { name?: string } | { name?: string }[] | null
}

type EventsResponse = {
  events: TimeclockEvent[]
  total: number
  employees?: EmployeeOption[]
  page?: number
  pageSize?: number
  canAdjustTime?: boolean
  error?: string
}

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB')
}

const toLocalDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const extractDeviceName = (device?: TimeclockEvent['timeclock_devices']) => {
  if (!device) return 'Unknown'
  return Array.isArray(device) ? device[0]?.name || 'Unknown' : device?.name || 'Unknown'
}

const extractEmployeeName = (employee?: TimeclockEvent['employees']) => {
  if (!employee) return 'Unknown'
  return Array.isArray(employee)
    ? employee[0]?.full_name || 'Unknown'
    : employee?.full_name || 'Unknown'
}

const getEffectiveDeviceTime = (event: {
  adjusted_device_ts?: string | null
  device_ts?: string | null
}) => event.adjusted_device_ts || event.device_ts || ''
const getEffectiveRecordedTime = (event: {
  adjusted_scanned_at?: string | null
  scanned_at?: string | null
}) => event.adjusted_scanned_at || event.scanned_at || ''

const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const escapeCsv = (value: string) => {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// Helper to format duration in HH:MM format
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}

// Calculate total time between IN and OUT punches
type DailyTotal = {
  date: string
  employeeId: string
  employeeName: string
  punches: TimeclockEvent[]
  totalMinutes: number
}

const calculateDailyTotals = (events: TimeclockEvent[]): DailyTotal[] => {
  const grouped: Map<string, TimeclockEvent[]> = new Map()

  // Group events by employee and date
  events.forEach((event) => {
    const date = new Date(getEffectiveRecordedTime(event))
    const dateKey = date.toLocaleDateString('en-GB')
    const employeeId = event.employee_id || 'unknown'
    const key = `${employeeId}|${dateKey}`

    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(event)
  })

  // Calculate totals for each day/employee pair
  const totals: DailyTotal[] = []
  grouped.forEach((punches) => {
    if (punches.length === 0) return

    const employeeId = punches[0].employee_id || 'unknown'
    const employeeName = extractEmployeeName(punches[0].employees)
    const date = new Date(getEffectiveRecordedTime(punches[0]))
    const dateKey = date.toLocaleDateString('en-GB')

    // Sort punches by time
    const sorted = [...punches].sort((a, b) => {
      const timeA = new Date(getEffectiveRecordedTime(a)).getTime()
      const timeB = new Date(getEffectiveRecordedTime(b)).getTime()
      return timeA - timeB
    })

    // Pair IN/OUT punches and calculate duration
    let totalMinutes = 0
    let lastOutTime: Date | null = null

    for (let i = 0; i < sorted.length; i++) {
      const punch = sorted[i]
      const punchType = (punch.punch_type || punch.event_type || '').toUpperCase()

      if (punchType === 'IN' || punchType === 'CLOCK_IN' || punchType === 'PUNCH_IN') {
        const punchTime = new Date(getEffectiveRecordedTime(punch))
        if (lastOutTime) {
          // If there's a pending OUT time, use it
          const duration = (punchTime.getTime() - lastOutTime.getTime()) / (1000 * 60)
          if (duration >= 0) {
            totalMinutes -= duration // Subtract break time
          }
        }
      } else if (punchType === 'OUT' || punchType === 'CLOCK_OUT' || punchType === 'PUNCH_OUT') {
        const punchTime = new Date(getEffectiveRecordedTime(punch))

        // Find last IN punch
        let inTime: Date | null = null
        for (let j = i - 1; j >= 0; j--) {
          const prevPunch = sorted[j]
          const prevType = (prevPunch.punch_type || prevPunch.event_type || '').toUpperCase()
          if (prevType === 'IN' || prevType === 'CLOCK_IN' || prevType === 'PUNCH_IN') {
            inTime = new Date(getEffectiveRecordedTime(prevPunch))
            break
          }
        }

        if (inTime) {
          const duration = (punchTime.getTime() - inTime.getTime()) / (1000 * 60)
          if (duration > 0) {
            totalMinutes += duration
          }
        }
        lastOutTime = punchTime
      }
    }

    totals.push({
      date: dateKey,
      employeeId,
      employeeName,
      punches: sorted,
      totalMinutes: Math.max(0, totalMinutes),
    })
  })

  return totals
}

// Calculate total time per employee (across all days in filter)
const calculateEmployeeTotals = (events: TimeclockEvent[]): Map<string, number> => {
  const employeeTotals: Map<string, number> = new Map()

  const dailyTotals = calculateDailyTotals(events)
  dailyTotals.forEach(({ employeeId, totalMinutes }) => {
    const current = employeeTotals.get(employeeId) || 0
    employeeTotals.set(employeeId, current + totalMinutes)
  })

  return employeeTotals
}

export default function TimeclockTeamClient() {
  const [events, setEvents] = useState<TimeclockEvent[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canAdjustTime, setCanAdjustTime] = useState(false)
  const [editingEvent, setEditingEvent] = useState<TimeclockEvent | null>(null)
  const [adjustedTimeInput, setAdjustedTimeInput] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustmentError, setAdjustmentError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      scope: 'team',
      page: `${page}`,
      pageSize: `${pageSize}`,
    })
    if (selectedEmployee) {
      params.set('employeeId', selectedEmployee)
    }
    if (dateFrom) {
      params.set('from', new Date(`${dateFrom}T00:00:00`).toISOString())
    }
    if (dateTo) {
      params.set('to', new Date(`${dateTo}T23:59:59.999`).toISOString())
    }
    return params.toString()
  }, [selectedEmployee, dateFrom, dateTo, page, pageSize])

  const loadEvents = useCallback(
    async (nextPage = page) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          scope: 'team',
          page: `${nextPage}`,
          pageSize: `${pageSize}`,
        })
        if (selectedEmployee) {
          params.set('employeeId', selectedEmployee)
        }
        if (dateFrom) {
          params.set('from', new Date(`${dateFrom}T00:00:00`).toISOString())
        }
        if (dateTo) {
          params.set('to', new Date(`${dateTo}T23:59:59.999`).toISOString())
        }

        const response = await fetch(`/api/timeclock/events?${params.toString()}`)
        const data: EventsResponse = await response.json()
        if (!response.ok) {
          setError(data?.error || 'Unable to load events.')
          return
        }
        setEvents(data.events || [])
        setEmployees(data.employees || [])
        setTotal(data.total || 0)
        setPage(data.page || nextPage)
        setPageSize(data.pageSize || pageSize)
        setCanAdjustTime(Boolean(data.canAdjustTime))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load events.')
      } finally {
        setLoading(false)
      }
    },
    [dateFrom, dateTo, page, pageSize, selectedEmployee],
  )

  const openAdjustmentDialog = (event: TimeclockEvent) => {
    setEditingEvent(event)
    setAdjustedTimeInput(toLocalDateTimeInput(getEffectiveRecordedTime(event)))
    setAdjustmentReason(event.adjustment_reason || '')
    setAdjustmentError('')
  }

  const closeAdjustmentDialog = () => {
    setEditingEvent(null)
    setAdjustedTimeInput('')
    setAdjustmentReason('')
    setAdjustmentError('')
    setAdjusting(false)
  }

  const submitAdjustment = async () => {
    if (!editingEvent) return

    if (!adjustedTimeInput) {
      setAdjustmentError('Choose the corrected recorded time.')
      return
    }

    if (adjustmentReason.trim().length < 8) {
      setAdjustmentError('Enter a short reason so the service issue is auditable.')
      return
    }

    try {
      setAdjusting(true)
      setAdjustmentError('')

      const response = await fetch(`/api/timeclock/events/${editingEvent.id}/adjust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustedTime: new Date(adjustedTimeInput).toISOString(),
          reason: adjustmentReason.trim(),
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to adjust time')
      }

      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === editingEvent.id
            ? {
                ...event,
                adjusted_device_ts: payload.event?.adjusted_device_ts,
                adjusted_scanned_at: payload.event?.adjusted_scanned_at,
                adjusted_at: payload.event?.adjusted_at,
                adjustment_reason: payload.event?.adjustment_reason,
              }
            : event,
        ),
      )

      closeAdjustmentDialog()
    } catch (err: unknown) {
      setAdjustmentError(err instanceof Error ? err.message : 'Failed to adjust time')
      setAdjusting(false)
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [loadEvents, queryString])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const teamSummary = useMemo(() => {
    const dailyTotals = calculateDailyTotals(events)
    const totalMinutes = dailyTotals.reduce((sum, item) => sum + item.totalMinutes, 0)
    const employeeIds = new Set(
      events.map((event) => event.employee_id).filter((id): id is string => Boolean(id)),
    )
    const adjusted = events.filter((event) => Boolean(event.adjusted_at)).length
    const unmatched = events.reduce((count, event) => {
      const value = (event.punch_type || event.event_type || '').toUpperCase()
      const knownPunch = [
        'IN',
        'OUT',
        'CLOCK_IN',
        'CLOCK_OUT',
        'PUNCH_IN',
        'PUNCH_OUT',
        'CHECK_IN',
        'CHECK_OUT',
      ].includes(value)
      return count + (knownPunch ? 0 : 1)
    }, 0)
    return {
      totalMinutes,
      employeeCount: employeeIds.size,
      adjusted,
      unmatched,
      dailyCount: dailyTotals.length,
    }
  }, [events])

  const applyPreset = (preset: 'today' | 'last7' | 'last30' | 'clear') => {
    setPage(1)
    if (preset === 'clear') {
      setDateFrom('')
      setDateTo('')
      return
    }

    const today = new Date()
    const end = toLocalDateInput(today)

    if (preset === 'today') {
      setDateFrom(end)
      setDateTo(end)
      return
    }

    const days = preset === 'last7' ? 6 : 29
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - days)
    setDateFrom(toLocalDateInput(startDate))
    setDateTo(end)
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        scope: 'team',
        export: '1',
        page: '1',
        pageSize: '5000',
      })
      if (selectedEmployee) {
        params.set('employeeId', selectedEmployee)
      }
      if (dateFrom) {
        params.set('from', new Date(`${dateFrom}T00:00:00`).toISOString())
      }
      if (dateTo) {
        params.set('to', new Date(`${dateTo}T23:59:59.999`).toISOString())
      }

      const response = await fetch(`/api/timeclock/events?${params.toString()}`)
      const data: EventsResponse = await response.json()
      if (!response.ok) {
        setError(data?.error || 'Unable to export events.')
        return
      }

      const csvRows: string[] = []

      // Add main events data
      const eventRows = (data.events || []).map((event) => {
        const geo = event.geo || {}
        return [
          extractEmployeeName(event.employees),
          extractDeviceName(event.timeclock_devices),
          event.punch_type || event.event_type,
          formatDate(getEffectiveDeviceTime(event)),
          formatDate(getEffectiveRecordedTime(event)),
          geo.lat?.toString() || '',
          geo.lng?.toString() || '',
          geo.accuracy?.toString() || '',
          event.adjusted_at ? 'Yes' : 'No',
          event.adjustment_reason || '',
        ]
      })

      const header = [
        'Employee',
        'Device',
        'Punch',
        'Device Time',
        'Recorded',
        'Latitude',
        'Longitude',
        'Accuracy',
        'Adjusted',
        'Adjustment Reason',
      ]

      csvRows.push(header.map((value) => escapeCsv(value)).join(','))
      eventRows.forEach((row) => {
        csvRows.push(row.map((value) => escapeCsv(value)).join(','))
      })

      // Add blank line and daily summary section
      csvRows.push('')
      csvRows.push('DAILY TIME SUMMARY')
      csvRows.push('Employee,Date,Total Hours')

      const dailyTotals = calculateDailyTotals(data.events || [])
      const sortedDailyTotals = [...dailyTotals].sort((a, b) => {
        const nameComp = a.employeeName.localeCompare(b.employeeName)
        if (nameComp !== 0) return nameComp
        return a.date.localeCompare(b.date)
      })

      sortedDailyTotals.forEach(({ employeeName, date, totalMinutes }) => {
        const totalHours = (totalMinutes / 60).toFixed(2)
        csvRows.push(`${escapeCsv(employeeName)},${escapeCsv(date)},${escapeCsv(totalHours)} hours`)
      })

      // Add employee summary
      csvRows.push('')
      csvRows.push('EMPLOYEE TOTAL SUMMARY')
      csvRows.push('Employee,Total Hours')

      const employeeTotals = calculateEmployeeTotals(data.events || [])
      const sortedEmployees = Array.from(employeeTotals.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      )

      sortedEmployees.forEach(([_employeeId, totalMinutes]) => {
        // Find employee name from daily totals
        const dailyTotal = dailyTotals.find((dt) => dt.employeeId === _employeeId)
        if (dailyTotal) {
          const totalHours = (totalMinutes / 60).toFixed(2)
          csvRows.push(`${escapeCsv(dailyTotal.employeeName)},${escapeCsv(totalHours)} hours`)
        }
      })

      const csv = csvRows.join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `timeclock-team-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to export events.')
    }
  }

  return (
    <div className="space-y-5">
      <section className="animate-enter-fade-up relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#7b1926] to-[#252830] px-5 py-6 text-white shadow-xl shadow-red-950/15 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-red-300/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-red-100">
              <Users className="h-4 w-4" />
              <p className="text-xs font-black uppercase tracking-[0.2em]">Manager workspace</p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Team punches</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-50/80">
              A calm, auditable view of the people and hours in your reporting scope. Use the
              filters below to review a shift or export the current view.
            </p>
          </div>
          <Link
            href="/dashboard/my-performance?view=attendance"
            className="ui-tap inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white backdrop-blur hover:bg-white/20"
          >
            My Performance <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Team punch summary">
        <article className="animate-enter-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Punches in view
            </p>
            <CalendarDays className="h-4 w-4 text-[#8b1e2d]" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">{total.toLocaleString('en-GB')}</p>
          <p className="mt-1 text-xs text-slate-500">
            {events.length.toLocaleString('en-GB')} loaded on this page
          </p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Recorded hours
            </p>
            <Clock3 className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {formatDuration(teamSummary.totalMinutes)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {teamSummary.dailyCount} employee-days with pairs
          </p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              People represented
            </p>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">{teamSummary.employeeCount}</p>
          <p className="mt-1 text-xs text-slate-500">Visible in the current page</p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Audit signals
            </p>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">{teamSummary.adjusted}</p>
          <p className="mt-1 text-xs text-slate-500">
            Adjusted punches
            {teamSummary.unmatched > 0 ? ` · ${teamSummary.unmatched} unclassified` : ''}
          </p>
        </article>
      </section>

      <section className="animate-enter-fade-up animate-enter-delay-1 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <TeamFiltersBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          selectedEmployee={selectedEmployee}
          employees={employees}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          setSelectedEmployee={setSelectedEmployee}
          setPage={setPage}
          applyPreset={applyPreset}
          onApply={() => loadEvents(1)}
          onExport={handleExport}
        />
      </section>

      {loading && (
        <div className="animate-enter-fade-up flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-[#8b1e2d]" /> Loading team punches...
        </div>
      )}
      {!loading && error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadEvents(page)}
            className="ui-tap inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#8b1e2d]"
          >
            Try again <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          <CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-3 font-black text-slate-700">No punches in this view</p>
          <p className="mt-1 text-xs">Try a wider date range or choose all employees.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <section className="animate-enter-fade-up animate-enter-delay-2 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {selectedEmployee && (
            <div className="mb-5 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4">
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-blue-900">
                Employee time summary
              </h3>
              {(() => {
                const dailyTotals = calculateDailyTotals(events)
                const employeeData = dailyTotals.filter((dt) => dt.employeeId === selectedEmployee)

                if (employeeData.length === 0) {
                  return <p className="text-sm text-blue-700">No data for this employee.</p>
                }

                const totalMinutes = employeeData.reduce((sum, d) => sum + d.totalMinutes, 0)
                const totalHours = (totalMinutes / 60).toFixed(2)

                return (
                  <div className="space-y-2">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-blue-100 bg-white p-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-blue-600">
                          Total hours
                        </div>
                        <div className="mt-1 text-lg font-black text-blue-900">{totalHours}</div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-white p-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-blue-600">
                          Working days
                        </div>
                        <div className="mt-1 text-lg font-black text-blue-900">
                          {employeeData.length}
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-white p-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-blue-600">
                          Average / day
                        </div>
                        <div className="mt-1 text-lg font-black text-blue-900">
                          {(totalMinutes / (employeeData.length * 60)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {employeeData.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-blue-100">
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-blue-700">
                          Daily breakdown
                        </p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                          {employeeData.map((dt) => (
                            <div
                              key={dt.date}
                              className="rounded-xl border border-blue-100 bg-white p-2 text-xs"
                            >
                              <div className="font-medium text-blue-900">{dt.date}</div>
                              <div className="text-blue-600">{formatDuration(dt.totalMinutes)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {!selectedEmployee && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4">
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-amber-900">
                Employee totals
              </h3>
              {(() => {
                const employeeTotals = calculateEmployeeTotals(events)

                if (employeeTotals.size === 0) {
                  return <p className="text-sm text-amber-700">No data available.</p>
                }

                const sortedEmployees = Array.from(employeeTotals.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)

                return (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    {sortedEmployees.map(([employeeId, totalMinutes]) => {
                      const dailyTotals = calculateDailyTotals(events)
                      const employeeInfo = dailyTotals.find((dt) => dt.employeeId === employeeId)
                      return (
                        <div
                          key={employeeId}
                          className="rounded-xl border border-amber-100 bg-white p-3"
                        >
                          <div className="truncate text-[11px] font-black uppercase tracking-wide text-amber-600">
                            {employeeInfo?.employeeName || 'Unknown'}
                          </div>
                          <div className="mt-1 text-lg font-black text-amber-900">
                            {(totalMinutes / 60).toFixed(1)}h
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          <TeamEventsTable
            events={events}
            canAdjustTime={canAdjustTime}
            formatDate={formatDate}
            extractEmployeeName={extractEmployeeName}
            extractDeviceName={extractDeviceName}
            getEffectiveDeviceTime={getEffectiveDeviceTime}
            getEffectiveRecordedTime={getEffectiveRecordedTime}
            onOpenAdjustment={openAdjustmentDialog}
          />
        </section>
      )}

      {editingEvent && (
        <TeamAdjustmentModal
          editingEvent={editingEvent}
          adjustedTimeInput={adjustedTimeInput}
          adjustmentReason={adjustmentReason}
          adjustmentError={adjustmentError}
          adjusting={adjusting}
          formatDate={formatDate}
          getEffectiveRecordedTime={getEffectiveRecordedTime}
          extractEmployeeName={extractEmployeeName}
          setAdjustedTimeInput={setAdjustedTimeInput}
          setAdjustmentReason={setAdjustmentReason}
          onClose={closeAdjustmentDialog}
          onSubmit={submitAdjustment}
        />
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-bold text-slate-500">
            Page {page} of {totalPages} - {total} total punches
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextPage = Math.max(1, page - 1)
                setPage(nextPage)
                loadEvents(nextPage)
              }}
              disabled={page === 1}
              className="ui-tap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => {
                const nextPage = Math.min(totalPages, page + 1)
                setPage(nextPage)
                loadEvents(nextPage)
              }}
              disabled={page >= totalPages}
              className="ui-tap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1)
                setPageSize(parseInt(event.target.value, 10))
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700"
            >
              {[10, 25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
