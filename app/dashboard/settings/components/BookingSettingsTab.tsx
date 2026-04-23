'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const INTERVAL_OPTIONS = [15, 20, 30, 45, 60]

export interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
}

export interface BranchSettingRow {
  id: string
  location_id: string
  day_of_week: number
  open_time: string
  close_time: string
  lunch_start_time: string | null
  lunch_end_time: string | null
  prayer_start_time: string | null
  prayer_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
}

export interface BookingServiceRow {
  id: string
  location_id: string
  name: string
  duration_minutes: number
  buffer_minutes: number
  available_days: number[] | null
  service_start_time: string | null
  service_end_time: string | null
  slot_interval_minutes: number | null
  is_active: boolean
}

interface BranchScheduleOverride {
  id: string
  location_id: string
  date: string
  open_time: string | null
  close_time: string | null
  lunch_start_time: string | null
  lunch_end_time: string | null
  prayer_start_time: string | null
  prayer_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
  notes: string | null
}

interface BookingSettingsTabProps {
  branchLocations: BranchLocationOption[]
  selectedLocationId: string
  onLocationChange: (locationId: string) => void
}

function LabeledInput({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function buildDefaultWeek(locationId: string): BranchSettingRow[] {
  return DAY_NAMES.map((_, day) => ({
    id: `temp-${day}`,
    location_id: locationId,
    day_of_week: day,
    open_time: '09:00',
    close_time: '17:00',
    lunch_start_time: '13:00',
    lunch_end_time: '14:00',
    prayer_start_time: day === 5 ? '13:00' : null,
    prayer_end_time: day === 5 ? '14:00' : null,
    is_closed: day === 0,
    concurrent_staff: 1,
    slot_interval_minutes: 30,
  }))
}

export default function BookingSettingsTab({
  branchLocations,
  selectedLocationId,
  onLocationChange,
}: BookingSettingsTabProps) {
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState<'hours' | 'overrides' | 'services'>('hours')

  const [weeklySettings, setWeeklySettings] = useState<BranchSettingRow[]>([])
  const [overrides, setOverrides] = useState<BranchScheduleOverride[]>([])
  const [services, setServices] = useState<BookingServiceRow[]>([])

  const [newService, setNewService] = useState({
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: [] as number[],
    service_start_time: '',
    service_end_time: '',
    slot_interval_minutes: 30,
  })
  const [showAddService, setShowAddService] = useState(false)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)

  const [newOverrideDate, setNewOverrideDate] = useState('')
  const [newOverride, setNewOverride] = useState<Omit<BranchScheduleOverride, 'id' | 'location_id' | 'date'>>({
    open_time: '09:00',
    close_time: '17:00',
    lunch_start_time: '13:00',
    lunch_end_time: '14:00',
    prayer_start_time: null,
    prayer_end_time: null,
    is_closed: false,
    concurrent_staff: 1,
    slot_interval_minutes: 30,
    notes: null,
  })

  const selectedBranch = useMemo(
    () => branchLocations.find((l) => l.id === selectedLocationId),
    [branchLocations, selectedLocationId]
  )

  const loadAll = async (locationId: string) => {
    if (!locationId) return

    setLoading(true)
    try {
      const from = new Date()
      const to = new Date(from)
      to.setUTCDate(to.getUTCDate() + 60)

      const [weeklyRes, overridesRes, servicesRes] = await Promise.all([
        fetch(`/api/bookings/settings/branch?location_id=${locationId}`),
        fetch(`/api/bookings/settings/overrides?location_id=${locationId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`),
        fetch(`/api/bookings/settings/services?location_id=${locationId}`),
      ])

      const weeklyJson = await weeklyRes.json()
      const overridesJson = await overridesRes.json()
      const servicesJson = await servicesRes.json()

      if (!weeklyRes.ok) throw new Error(weeklyJson.error || 'Failed to load weekly settings')
      if (!overridesRes.ok) throw new Error(overridesJson.error || 'Failed to load overrides')
      if (!servicesRes.ok) throw new Error(servicesJson.error || 'Failed to load services')

      const rows = (weeklyJson.settings || []) as BranchSettingRow[]
      setWeeklySettings(rows.length > 0 ? rows : buildDefaultWeek(locationId))
      setOverrides((overridesJson.overrides || []) as BranchScheduleOverride[])
      setServices((servicesJson.services || []) as BookingServiceRow[])
    } catch (error) {
      toast.error('Failed to load booking settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setWeeklySettings(buildDefaultWeek(locationId))
      setOverrides([])
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedLocationId) {
      loadAll(selectedLocationId)
    }
  }, [selectedLocationId])

  const updateDay = (
    day: number,
    field: keyof BranchSettingRow,
    value: string | number | boolean | null
  ) => {
    setWeeklySettings((prev) =>
      prev.map((row) => (row.day_of_week === day ? { ...row, [field]: value } : row))
    )
  }

  const toggleServiceDay = (days: number[] | null, day: number): number[] => {
    const base = Array.isArray(days) ? days : []
    if (base.includes(day)) {
      return base.filter((d) => d !== day)
    }
    return [...base, day].sort((a, b) => a - b)
  }

  const saveWeekly = async () => {
    if (!selectedLocationId) return

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: selectedLocationId, settings: weeklySettings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Weekly branch settings saved')
      await loadAll(selectedLocationId)
    } catch (error) {
      toast.error('Failed to save weekly settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveOverride = async () => {
    if (!selectedLocationId || !newOverrideDate) {
      toast.error('Select a date for the one-off schedule')
      return
    }

    setLoading(true)
    try {
      const payload = {
        location_id: selectedLocationId,
        date: newOverrideDate,
        ...newOverride,
      }

      const res = await fetch('/api/bookings/settings/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success('One-off schedule saved')
      setNewOverrideDate('')
      await loadAll(selectedLocationId)
    } catch (error) {
      toast.error('Failed to save one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteOverride = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/overrides/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setOverrides((prev) => prev.filter((o) => o.id !== id))
      toast.success('One-off schedule deleted')
    } catch (error) {
      toast.error('Failed to delete one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const addService = async () => {
    if (!selectedLocationId || !newService.name.trim()) {
      toast.error('Service name is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: selectedLocationId,
          name: newService.name,
          duration_minutes: newService.duration_minutes,
          buffer_minutes: newService.buffer_minutes,
          available_days: newService.available_days,
          service_start_time: newService.service_start_time || null,
          service_end_time: newService.service_end_time || null,
          slot_interval_minutes: newService.slot_interval_minutes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => [...prev, json.service])
      setNewService({
        name: '',
        duration_minutes: 30,
        buffer_minutes: 15,
        available_days: [],
        service_start_time: '',
        service_end_time: '',
        slot_interval_minutes: 30,
      })
      setShowAddService(false)
      toast.success('Service added')
    } catch (error) {
      toast.error('Failed to add service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveService = async () => {
    if (!editingService) return

    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${editingService.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingService.name,
          duration_minutes: editingService.duration_minutes,
          buffer_minutes: editingService.buffer_minutes,
          available_days: editingService.available_days,
          service_start_time: editingService.service_start_time,
          service_end_time: editingService.service_end_time,
          slot_interval_minutes: editingService.slot_interval_minutes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => prev.map((s) => (s.id === editingService.id ? json.service : s)))
      setEditingService(null)
      toast.success('Service updated')
    } catch (error) {
      toast.error('Failed to update service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleService = async (service: BookingServiceRow) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !service.is_active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => prev.map((s) => (s.id === service.id ? json.service : s)))
    } catch (error) {
      toast.error('Failed to update service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const removeService = async (serviceId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${serviceId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => prev.filter((s) => s.id !== serviceId))
      toast.success('Service deleted')
    } catch (error) {
      toast.error('Failed to delete service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-sm font-semibold text-slate-700">Branch Location</label>
        <select
          value={selectedLocationId}
          onChange={(e) => onLocationChange(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[260px]"
        >
          {branchLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}{location.branch_code ? ` (${location.branch_code})` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Settings apply to: <span className="font-semibold">{selectedBranch?.name || 'Branch'}</span>
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveSection('hours')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeSection === 'hours' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Weekly Hours & Breaks
        </button>
        <button
          onClick={() => setActiveSection('overrides')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeSection === 'overrides' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          One-off Schedule
        </button>
        <button
          onClick={() => setActiveSection('services')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeSection === 'services' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Services & Slot Gaps
        </button>
      </div>

      {activeSection === 'hours' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Configure branch opening hours and breaks. Slot interval here is the default; services can override it with their own timing window.</p>
            <button
              onClick={saveWeekly}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Weekly Settings'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm bg-white">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Open</th>
                  <th className="px-3 py-2 text-left">Close</th>
                  <th className="px-3 py-2 text-left">Lunch Start</th>
                  <th className="px-3 py-2 text-left">Lunch End</th>
                  <th className="px-3 py-2 text-left">Prayer Start</th>
                  <th className="px-3 py-2 text-left">Prayer End</th>
                  <th className="px-3 py-2 text-left">Staff</th>
                  <th className="px-3 py-2 text-center">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weeklySettings.map((row) => (
                  <tr key={row.day_of_week}>
                    <td className="px-3 py-2 font-medium text-slate-700">{DAY_NAMES[row.day_of_week]}</td>
                    <td className="px-3 py-2"><input type="time" value={row.open_time} onChange={(e) => updateDay(row.day_of_week, 'open_time', e.target.value)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="time" value={row.close_time} onChange={(e) => updateDay(row.day_of_week, 'close_time', e.target.value)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="time" value={row.lunch_start_time || ''} onChange={(e) => updateDay(row.day_of_week, 'lunch_start_time', e.target.value || null)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="time" value={row.lunch_end_time || ''} onChange={(e) => updateDay(row.day_of_week, 'lunch_end_time', e.target.value || null)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="time" value={row.prayer_start_time || ''} onChange={(e) => updateDay(row.day_of_week, 'prayer_start_time', e.target.value || null)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="time" value={row.prayer_end_time || ''} onChange={(e) => updateDay(row.day_of_week, 'prayer_end_time', e.target.value || null)} className="border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="number" min={1} value={row.concurrent_staff} onChange={(e) => updateDay(row.day_of_week, 'concurrent_staff', Math.max(1, Number(e.target.value)))} className="w-16 border border-slate-300 rounded px-2 py-1" /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={row.is_closed} onChange={(e) => updateDay(row.day_of_week, 'is_closed', e.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'overrides' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Add One-off Schedule (special date)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LabeledInput label="Date">
                <input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Branch Open Time">
                <input type="time" value={newOverride.open_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, open_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Branch Close Time">
                <input type="time" value={newOverride.close_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, close_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Lunch Break Start">
                <input type="time" value={newOverride.lunch_start_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, lunch_start_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Lunch Break End">
                <input type="time" value={newOverride.lunch_end_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, lunch_end_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Prayer Break Start">
                <input type="time" value={newOverride.prayer_start_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, prayer_start_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Prayer Break End">
                <input type="time" value={newOverride.prayer_end_time || ''} onChange={(e) => setNewOverride((p) => ({ ...p, prayer_end_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Concurrent Staff">
                <input type="number" min={1} value={newOverride.concurrent_staff} onChange={(e) => setNewOverride((p) => ({ ...p, concurrent_staff: Math.max(1, Number(e.target.value)) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Slot Interval (deprecated: use service slots)">
                <select value={newOverride.slot_interval_minutes} onChange={(e) => setNewOverride((p) => ({ ...p, slot_interval_minutes: Number(e.target.value) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                  {INTERVAL_OPTIONS.map((v) => <option key={v} value={v}>{v} min interval</option>)}
                </select>
              </LabeledInput>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={newOverride.is_closed} onChange={(e) => setNewOverride((p) => ({ ...p, is_closed: e.target.checked }))} /> Closed all day</label>
              <button onClick={saveOverride} disabled={loading} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{loading ? 'Saving...' : 'Save One-off Schedule'}</button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Upcoming One-off Schedules</div>
            {overrides.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 text-center">No one-off schedules configured</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overrides.map((row) => (
                  <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{row.date}{row.is_closed ? ' (Closed)' : ''}</p>
                      <p className="text-xs text-slate-500">
                        {row.open_time || '--'}-{row.close_time || '--'} | Lunch {row.lunch_start_time || '--'}-{row.lunch_end_time || '--'} | Prayer {row.prayer_start_time || '--'}-{row.prayer_end_time || '--'} | Staff {row.concurrent_staff}
                      </p>
                    </div>
                    <button onClick={() => deleteOverride(row.id)} className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-600 bg-red-50">Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Define service-specific days, service hours, and slot intervals. All service timings are still clipped to branch opening/break rules.</p>
            <button onClick={() => setShowAddService(true)} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium">+ Add Service</button>
          </div>

          {showAddService && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <LabeledInput label="Service Name">
                <input type="text" value={newService.name} onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Medical" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Duration (minutes)">
                <input type="number" min={5} value={newService.duration_minutes} onChange={(e) => setNewService((p) => ({ ...p, duration_minutes: Number(e.target.value) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Buffer (minutes)">
                <input type="number" min={0} value={newService.buffer_minutes} onChange={(e) => setNewService((p) => ({ ...p, buffer_minutes: Number(e.target.value) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Service Start Time">
                <input type="time" value={newService.service_start_time} onChange={(e) => setNewService((p) => ({ ...p, service_start_time: e.target.value }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Service End Time">
                <input type="time" value={newService.service_end_time} onChange={(e) => setNewService((p) => ({ ...p, service_end_time: e.target.value }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </LabeledInput>
              <LabeledInput label="Slot Every (minutes)">
                <select value={newService.slot_interval_minutes} onChange={(e) => setNewService((p) => ({ ...p, slot_interval_minutes: Number(e.target.value) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                  {INTERVAL_OPTIONS.map((v) => <option key={v} value={v}>{v} min slot</option>)}
                </select>
              </LabeledInput>
              <div className="md:col-span-3 rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-medium text-slate-500 mb-2">Available days</p>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, day) => {
                    const active = newService.available_days.includes(day)
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setNewService((p) => ({ ...p, available_days: toggleServiceDay(p.available_days, day) }))}
                        className={`px-2 py-1 rounded text-xs border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addService} disabled={loading} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm disabled:opacity-50">Add</button>
                <button onClick={() => setShowAddService(false)} className="px-3 py-2 rounded border border-slate-300 text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {services.map((service) => (
              <div key={service.id} className="rounded-lg border border-slate-200 bg-white p-4">
                {editingService?.id === service.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                    <LabeledInput label="Service Name">
                      <input type="text" value={editingService.name} onChange={(e) => setEditingService((p) => (p ? { ...p, name: e.target.value } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                    </LabeledInput>
                    <LabeledInput label="Duration (minutes)">
                      <input type="number" min={5} value={editingService.duration_minutes} onChange={(e) => setEditingService((p) => (p ? { ...p, duration_minutes: Number(e.target.value) } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                    </LabeledInput>
                    <LabeledInput label="Buffer (minutes)">
                      <input type="number" min={0} value={editingService.buffer_minutes} onChange={(e) => setEditingService((p) => (p ? { ...p, buffer_minutes: Number(e.target.value) } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                    </LabeledInput>
                    <LabeledInput label="Service Start Time">
                      <input type="time" value={editingService.service_start_time || ''} onChange={(e) => setEditingService((p) => (p ? { ...p, service_start_time: e.target.value || null } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                    </LabeledInput>
                    <LabeledInput label="Service End Time">
                      <input type="time" value={editingService.service_end_time || ''} onChange={(e) => setEditingService((p) => (p ? { ...p, service_end_time: e.target.value || null } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                    </LabeledInput>
                    <LabeledInput label="Slot Every (minutes)">
                      <select value={editingService.slot_interval_minutes ?? 30} onChange={(e) => setEditingService((p) => (p ? { ...p, slot_interval_minutes: Number(e.target.value) } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                        {INTERVAL_OPTIONS.map((v) => <option key={v} value={v}>{v} min slot</option>)}
                      </select>
                    </LabeledInput>
                    <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-500 mb-2">Available days</p>
                      <div className="flex flex-wrap gap-2">
                        {DAY_NAMES.map((name, day) => {
                          const active = Array.isArray(editingService.available_days) && editingService.available_days.includes(day)
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => setEditingService((p) => (p ? { ...p, available_days: toggleServiceDay(p.available_days, day) } : p))}
                              className={`px-2 py-1 rounded text-xs border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                            >
                              {name.slice(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveService} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Save</button>
                      <button onClick={() => setEditingService(null)} className="px-3 py-2 rounded border border-slate-300 text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{service.name}</p>
                      <p className="text-xs text-slate-500">
                        Duration {service.duration_minutes} min · Buffer {service.buffer_minutes} min · Slot {service.slot_interval_minutes ?? 'Branch default'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Days: {Array.isArray(service.available_days) && service.available_days.length > 0 ? service.available_days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ') : 'All'} ·
                        Time: {service.service_start_time || 'Branch open'} - {service.service_end_time || 'Branch close'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingService(service)} className="px-3 py-1.5 rounded border border-slate-300 text-xs">Edit</button>
                      <button onClick={() => toggleService(service)} className={`px-3 py-1.5 rounded text-xs ${service.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{service.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={() => removeService(service.id)} className="px-3 py-1.5 rounded bg-red-50 text-red-600 text-xs">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {services.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No services for this branch yet</div>}
          </div>
        </div>
      )}
    </div>
  )
}
