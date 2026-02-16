'use client'

import { useEffect, useMemo, useState } from 'react'

type EmployeeOption = {
  id: string
  name: string
}

type TimeclockEvent = {
  id: string
  employee_id?: string
  event_type: string
  device_ts: string
  scanned_at: string
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
  return Array.isArray(employee) ? employee[0]?.full_name || 'Unknown' : employee?.full_name || 'Unknown'
}

const getDateKey = (value?: string | null) => {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildPunchMap = (events: TimeclockEvent[]) => {
  const map = new Map<string, string>()
  const grouped = new Map<string, TimeclockEvent[]>()

  events.forEach((event) => {
    const dateKey = getDateKey(event.scanned_at)
    const groupKey = `${event.employee_id || 'team'}:${dateKey}`
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)?.push(event)
  })

  grouped.forEach((groupEvents) => {
    const ordered = [...groupEvents].sort(
      (a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    )
    ordered.forEach((event, index) => {
      map.set(event.id, index % 2 === 0 ? 'IN' : 'OUT')
    })
  })

  return map
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
        setError((data as any)?.error || 'Unable to load events.')
        return
      }
      setEvents(data.events || [])
      setEmployees(data.employees || [])
      setTotal(data.total || 0)
      setPage(data.page || nextPage)
      setPageSize(data.pageSize || pageSize)
    } catch (err: any) {
      setError(err?.message || 'Unable to load events.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [queryString])

  const punchMap = buildPunchMap(events)
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
        setError((data as any)?.error || 'Unable to export events.')
        return
      }

      const exportPunchMap = buildPunchMap(data.events || [])
      const rows = (data.events || []).map((event) => {
        const geo = event.geo || {}
        return [
          extractEmployeeName(event.employees),
          extractDeviceName(event.timeclock_devices),
          exportPunchMap.get(event.id) || event.event_type,
          formatDate(event.device_ts),
          formatDate(event.scanned_at),
          geo.lat?.toString() || '',
          geo.lng?.toString() || '',
          geo.accuracy?.toString() || '',
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
    } catch (err: any) {
      setError(err?.message || 'Unable to export events.')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Team punches</h2>
          <p className="text-sm text-slate-500">Filter by employee to review punches.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last7')}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Last 7
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last30')}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Last 30
            </button>
            <button
              type="button"
              onClick={() => applyPreset('clear')}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Clear
            </button>
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setPage(1)
              setDateFrom(event.target.value)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setPage(1)
              setDateTo(event.target.value)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
          />
          <select
            value={selectedEmployee}
            onChange={(event) => {
              setPage(1)
              setSelectedEmployee(event.target.value)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
          >
            <option value="">All employees</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadEvents(1)}
            className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="text-sm text-slate-700 hover:text-slate-900 font-semibold"
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading events...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-slate-500">No punches recorded yet.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Punch</th>
                <th className="py-2 pr-4">Device time</th>
                <th className="py-2 pr-4">Recorded</th>
                <th className="py-2 pr-4">Location</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {events.map((event) => {
                const geo = event.geo
                const geoText = geo?.lat && geo?.lng
                  ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${geo.accuracy ? ` (${Math.round(geo.accuracy)}m)` : ''}`
                  : '-'
                return (
                  <tr key={event.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-3 pr-4 font-medium">{extractEmployeeName(event.employees)}</td>
                    <td className="py-3 pr-4">{extractDeviceName(event.timeclock_devices)}</td>
                    <td className="py-3 pr-4">
                      {punchMap.get(event.id) || event.event_type}
                    </td>
                    <td className="py-3 pr-4">{formatDate(event.device_ts)}</td>
                    <td className="py-3 pr-4">{formatDate(event.scanned_at)}</td>
                    <td className="py-3 pr-4">{geoText}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
