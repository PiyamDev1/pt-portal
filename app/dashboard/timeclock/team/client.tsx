'use client'

import { useEffect, useMemo, useState } from 'react'
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

const getEffectiveDeviceTime = (event: TimeclockEvent) =>
  event.adjusted_device_ts || event.device_ts
const getEffectiveRecordedTime = (event: TimeclockEvent) =>
  event.adjusted_scanned_at || event.scanned_at

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

  const loadEvents = async (nextPage = page) => {
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
  }

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
    loadEvents()
  }, [queryString])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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

      const rows = (data.events || []).map((event) => {
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

      const csv = [header, ...rows]
        .map((row) => row.map((value) => escapeCsv(value)).join(','))
        .join('\n')

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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
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

      {loading && <p className="text-sm text-slate-500">Loading events...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-slate-500">No punches recorded yet.</p>
      )}

      {!loading && !error && events.length > 0 && (
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
          <div className="text-sm text-slate-500">
            Page {page} of {totalPages} - {total} total
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
              className="px-3 py-1.5 rounded border border-slate-200 text-sm text-slate-700 disabled:opacity-40"
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
              className="px-3 py-1.5 rounded border border-slate-200 text-sm text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1)
                setPageSize(parseInt(event.target.value, 10))
              }}
              className="px-2 py-1.5 rounded border border-slate-200 text-sm text-slate-700"
            >
              {[10, 25, 50, 100].map((size) => (
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
