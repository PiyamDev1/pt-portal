'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const INTERVAL_OPTIONS = [15, 20, 30, 45, 60]
const TEMPLATE_VARIABLES = ['[Customer Name]', '[date booked]', '[time booked]', '[service booked]', '[branch name]']
type TemplateField = 'confirmation_template' | 'modification_template' | 'cancellation_template'

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
  confirmation_template: string | null
  modification_template: string | null
  cancellation_template: string | null
  max_group_size: number
  duration_per_additional_person_minutes: number
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
  const [activeSection, setActiveSection] = useState<'overrides' | 'services'>('overrides')

  const [weeklySettings, setWeeklySettings] = useState<BranchSettingRow[]>([])
  const [overrides, setOverrides] = useState<BranchScheduleOverride[]>([])
  const [services, setServices] = useState<BookingServiceRow[]>([])

  const [newService, setNewService] = useState({
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: [] as number[],
    confirmation_template: '',
    modification_template: '',
    cancellation_template: '',
    service_start_time: '',
    service_end_time: '',
    slot_interval_minutes: 30,
    max_group_size: 1,
    duration_per_additional_person_minutes: 0,
  })
  const [showAddService, setShowAddService] = useState(false)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)
  const [activeNewTemplateField, setActiveNewTemplateField] = useState<TemplateField>('confirmation_template')
  const [activeEditTemplateField, setActiveEditTemplateField] = useState<TemplateField>('confirmation_template')
  const newTemplateRefs = useRef<Record<TemplateField, HTMLTextAreaElement | null>>({
    confirmation_template: null,
    modification_template: null,
    cancellation_template: null,
  })
  const editTemplateRefs = useRef<Record<TemplateField, HTMLTextAreaElement | null>>({
    confirmation_template: null,
    modification_template: null,
    cancellation_template: null,
  })

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

  const insertTokenAtSelection = (
    currentValue: string,
    token: string,
    textarea: HTMLTextAreaElement | null
  ) => {
    if (!textarea) {
      return `${currentValue}${currentValue.endsWith(' ') || currentValue.length === 0 ? '' : ' '}${token}`
    }

    const start = textarea.selectionStart ?? currentValue.length
    const end = textarea.selectionEnd ?? currentValue.length
    return `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`
  }

  const moveCursorAfterInsert = (textarea: HTMLTextAreaElement | null, tokenLength: number) => {
    if (!textarea) return
    const cursorStart = textarea.selectionStart ?? textarea.value.length
    const nextCursor = cursorStart + tokenLength
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const insertTemplateToken = (mode: 'new' | 'edit', token: string) => {
    if (mode === 'new') {
      const field = activeNewTemplateField
      const textarea = newTemplateRefs.current[field]
      setNewService((prev) => {
        const current = prev[field] || ''
        const next = insertTokenAtSelection(current, token, textarea)
        return { ...prev, [field]: next }
      })
      moveCursorAfterInsert(textarea, token.length)
      return
    }

    if (!editingService) return
    const field = activeEditTemplateField
    const textarea = editTemplateRefs.current[field]
    setEditingService((prev) => {
      if (!prev) return prev
      const current = prev[field] || ''
      const next = insertTokenAtSelection(current, token, textarea)
      return { ...prev, [field]: next }
    })
    moveCursorAfterInsert(textarea, token.length)
  }

  const buildTemplateErrorMessage = (json: any): string => {
    if (!Array.isArray(json?.template_errors)) return json?.error || 'Invalid template variables'
    const details = json.template_errors
      .map((entry: { field: string; invalidTokens: string[] }) => `${entry.field}: ${entry.invalidTokens.join(', ')}`)
      .join(' | ')
    return `${json.error || 'Template contains unsupported placeholders'} (${details})`
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
          confirmation_template: newService.confirmation_template || null,
          modification_template: newService.modification_template || null,
          cancellation_template: newService.cancellation_template || null,
          max_group_size: newService.max_group_size,
          duration_per_additional_person_minutes: newService.duration_per_additional_person_minutes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(buildTemplateErrorMessage(json))
      setServices((prev) => [...prev, json.service])
      setNewService({
        name: '',
        duration_minutes: 30,
        buffer_minutes: 15,
        available_days: [],
        service_start_time: '',
        service_end_time: '',
        slot_interval_minutes: 30,
        confirmation_template: '',
        modification_template: '',
        cancellation_template: '',
        max_group_size: 1,
        duration_per_additional_person_minutes: 0,
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
          confirmation_template: editingService.confirmation_template,
          modification_template: editingService.modification_template,
          cancellation_template: editingService.cancellation_template,
          max_group_size: editingService.max_group_size,
          duration_per_additional_person_minutes: editingService.duration_per_additional_person_minutes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(buildTemplateErrorMessage(json))
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
            <p className="text-sm text-slate-600">Define service-specific days, service hours, slot intervals, and customer email templates for booked/modified/cancelled events.</p>
            <button onClick={() => setShowAddService(true)} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium">+ Add Service</button>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">Template Variables</p>
            <p className="mt-1">Use square brackets exactly as shown, for example: Dear [Customer Name].</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((token) => (
                <span key={token} className="rounded bg-white border border-blue-200 px-2 py-1 text-xs text-blue-800">{token}</span>
              ))}
            </div>
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
              <LabeledInput label="Max Group Size">
                <input type="number" min={1} max={20} value={newService.max_group_size} onChange={(e) => setNewService((p) => ({ ...p, max_group_size: Math.max(1, Number(e.target.value)) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-slate-400">1 = no group bookings</p>
              </LabeledInput>
              <LabeledInput label="Extra Time per Additional Person (minutes)">
                <input type="number" min={0} value={newService.duration_per_additional_person_minutes} onChange={(e) => setNewService((p) => ({ ...p, duration_per_additional_person_minutes: Math.max(0, Number(e.target.value)) }))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-slate-400">e.g. 22 mins → 3 people ≈ 2.5 slots</p>
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
              <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <LabeledInput label="Booking Confirmation Email Template">
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button key={`new-confirmation-${token}`} type="button" onClick={() => insertTemplateToken('new', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                      ))}
                    </div>
                    <textarea ref={(el) => { newTemplateRefs.current.confirmation_template = el }} value={newService.confirmation_template} onFocus={() => setActiveNewTemplateField('confirmation_template')} onChange={(e) => setNewService((p) => ({ ...p, confirmation_template: e.target.value }))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Dear [Customer Name],\n\nYour appointment has been booked for [date booked] at [time booked] for [service booked]." />
                  </>
                </LabeledInput>
                <LabeledInput label="Booking Modification Email Template">
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button key={`new-modification-${token}`} type="button" onClick={() => insertTemplateToken('new', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                      ))}
                    </div>
                    <textarea ref={(el) => { newTemplateRefs.current.modification_template = el }} value={newService.modification_template} onFocus={() => setActiveNewTemplateField('modification_template')} onChange={(e) => setNewService((p) => ({ ...p, modification_template: e.target.value }))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Dear [Customer Name],\n\nYour appointment has been updated to [date booked] at [time booked] for [service booked]." />
                  </>
                </LabeledInput>
                <LabeledInput label="Booking Cancellation Email Template">
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button key={`new-cancellation-${token}`} type="button" onClick={() => insertTemplateToken('new', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                      ))}
                    </div>
                    <textarea ref={(el) => { newTemplateRefs.current.cancellation_template = el }} value={newService.cancellation_template} onFocus={() => setActiveNewTemplateField('cancellation_template')} onChange={(e) => setNewService((p) => ({ ...p, cancellation_template: e.target.value }))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Dear [Customer Name],\n\nYour appointment for [service booked] on [date booked] at [time booked] has been cancelled." />
                  </>
                </LabeledInput>
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
                    <LabeledInput label="Max Group Size">
                      <input type="number" min={1} max={20} value={editingService.max_group_size ?? 1} onChange={(e) => setEditingService((p) => (p ? { ...p, max_group_size: Math.max(1, Number(e.target.value)) } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                      <p className="mt-1 text-[11px] text-slate-400">1 = no group bookings</p>
                    </LabeledInput>
                    <LabeledInput label="Extra Time per Additional Person (minutes)">
                      <input type="number" min={0} value={editingService.duration_per_additional_person_minutes ?? 0} onChange={(e) => setEditingService((p) => (p ? { ...p, duration_per_additional_person_minutes: Math.max(0, Number(e.target.value)) } : p))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                      <p className="mt-1 text-[11px] text-slate-400">e.g. 22 mins → 3 people ≈ 2.5 slots</p>
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
                    <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LabeledInput label="Booking Confirmation Email Template">
                        <>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button key={`edit-confirmation-${service.id}-${token}`} type="button" onClick={() => insertTemplateToken('edit', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                            ))}
                          </div>
                          <textarea ref={(el) => { editTemplateRefs.current.confirmation_template = el }} value={editingService.confirmation_template || ''} onFocus={() => setActiveEditTemplateField('confirmation_template')} onChange={(e) => setEditingService((p) => (p ? { ...p, confirmation_template: e.target.value || null } : p))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                        </>
                      </LabeledInput>
                      <LabeledInput label="Booking Modification Email Template">
                        <>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button key={`edit-modification-${service.id}-${token}`} type="button" onClick={() => insertTemplateToken('edit', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                            ))}
                          </div>
                          <textarea ref={(el) => { editTemplateRefs.current.modification_template = el }} value={editingService.modification_template || ''} onFocus={() => setActiveEditTemplateField('modification_template')} onChange={(e) => setEditingService((p) => (p ? { ...p, modification_template: e.target.value || null } : p))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                        </>
                      </LabeledInput>
                      <LabeledInput label="Booking Cancellation Email Template">
                        <>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button key={`edit-cancellation-${service.id}-${token}`} type="button" onClick={() => insertTemplateToken('edit', token)} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">{token}</button>
                            ))}
                          </div>
                          <textarea ref={(el) => { editTemplateRefs.current.cancellation_template = el }} value={editingService.cancellation_template || ''} onFocus={() => setActiveEditTemplateField('cancellation_template')} onChange={(e) => setEditingService((p) => (p ? { ...p, cancellation_template: e.target.value || null } : p))} rows={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                        </>
                      </LabeledInput>
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
                      <p className="text-xs text-slate-400 mt-1">
                        Group: max {service.max_group_size ?? 1} {(service.max_group_size ?? 1) > 1 ? `person(s) · +${service.duration_per_additional_person_minutes ?? 0} min/extra person` : '(individual only)'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Templates: {service.confirmation_template ? 'Booked' : '--'} / {service.modification_template ? 'Modified' : '--'} / {service.cancellation_template ? 'Cancelled' : '--'}
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
