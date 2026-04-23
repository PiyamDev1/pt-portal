/**
 * BookingSettingsTab
 * Admin panel to manage branch operating hours and booking services.
 * Matches the conventions of existing settings tab components.
 */
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const INTERVAL_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
]

export interface BranchSettingRow {
  id: string
  day_of_week: number
  open_time: string
  close_time: string
  lunch_start_time: string | null
  lunch_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
}

export interface BookingServiceRow {
  id: string
  name: string
  duration_minutes: number
  buffer_minutes: number
  is_active: boolean
}

interface BookingSettingsTabProps {
  initialBranchSettings: BranchSettingRow[]
  initialServices: BookingServiceRow[]
  supabase?: SupabaseClient
  loading: boolean
  setLoading: (v: boolean) => void
}

export default function BookingSettingsTab({
  initialBranchSettings,
  initialServices,
  loading,
  setLoading,
}: BookingSettingsTabProps) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<'hours' | 'services'>('hours')

  // --- Branch Hours State ---
  const [branchSettings, setBranchSettings] = useState<BranchSettingRow[]>(
    DAY_NAMES.map((_, i) => {
      const existing = initialBranchSettings.find((s) => s.day_of_week === i)
      return (
        existing ?? {
          id: '',
          day_of_week: i,
          open_time: '09:00',
          close_time: '17:00',
          lunch_start_time: '13:00',
          lunch_end_time: '14:00',
          is_closed: i === 0, // Sunday closed by default
          concurrent_staff: 1,
          slot_interval_minutes: 30,
        }
      )
    })
  )

  // --- Services State ---
  const [services, setServices] = useState<BookingServiceRow[]>(initialServices)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)
  const [newService, setNewService] = useState({
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
  })
  const [showAddService, setShowAddService] = useState(false)

  // --- Branch Hours Handlers ---
  const updateDaySetting = (
    dayIndex: number,
    field: keyof BranchSettingRow,
    value: string | number | boolean
  ) => {
    setBranchSettings((prev) =>
      prev.map((row) => (row.day_of_week === dayIndex ? { ...row, [field]: value } : row))
    )
  }

  const handleSaveHours = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: branchSettings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Operating hours saved')
      router.refresh()
    } catch (err: unknown) {
      toast.error('Failed to save hours', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  // --- Services Handlers ---
  const handleAddService = async () => {
    if (!newService.name.trim()) {
      toast.error('Service name is required')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newService),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => [...prev, json.service])
      setNewService({ name: '', duration_minutes: 30, buffer_minutes: 15 })
      setShowAddService(false)
      toast.success('Service added')
    } catch (err: unknown) {
      toast.error('Failed to add service', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveService = async () => {
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
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) =>
        prev.map((s) => (s.id === editingService.id ? json.service : s))
      )
      setEditingService(null)
      toast.success('Service updated')
    } catch (err: unknown) {
      toast.error('Failed to update service', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleService = async (service: BookingServiceRow) => {
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
      toast.success(`Service ${service.is_active ? 'deactivated' : 'activated'}`)
    } catch (err: unknown) {
      toast.error('Failed to update service', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteService = async (service: BookingServiceRow) => {
    if (
      !confirm(
        `Delete "${service.name}"? This cannot be undone if it has no active bookings.`
      )
    )
      return
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${service.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => prev.filter((s) => s.id !== service.id))
      toast.success('Service deleted')
    } catch (err: unknown) {
      toast.error('Failed to delete service', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Section Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('hours')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'hours'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          🕐 Operating Hours
        </button>
        <button
          onClick={() => setActiveSection('services')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'services'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          🛠️ Services
        </button>
      </div>

      {/* ─── OPERATING HOURS ─── */}
      {activeSection === 'hours' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Branch Operating Hours</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure opening times, lunch breaks, and slot intervals per day
              </p>
            </div>
            <button
              onClick={handleSaveHours}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving…' : 'Save Hours'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-28">Day</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Open</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Close</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Lunch Start</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Lunch End</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Slot Every</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Staff</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {branchSettings.map((row) => (
                  <tr
                    key={row.day_of_week}
                    className={row.is_closed ? 'opacity-50 bg-slate-50' : ''}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {DAY_NAMES[row.day_of_week]}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.open_time}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(row.day_of_week, 'open_time', e.target.value)
                        }
                        className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.close_time}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(row.day_of_week, 'close_time', e.target.value)
                        }
                        className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.lunch_start_time ?? ''}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(
                            row.day_of_week,
                            'lunch_start_time',
                            e.target.value || null as unknown as string
                          )
                        }
                        className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                        placeholder="None"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.lunch_end_time ?? ''}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(
                            row.day_of_week,
                            'lunch_end_time',
                            e.target.value || null as unknown as string
                          )
                        }
                        className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                        placeholder="None"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.slot_interval_minutes}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(
                            row.day_of_week,
                            'slot_interval_minutes',
                            Number(e.target.value)
                          )
                        }
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={row.concurrent_staff}
                        disabled={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(
                            row.day_of_week,
                            'concurrent_staff',
                            Math.max(1, Number(e.target.value))
                          )
                        }
                        className="w-16 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.is_closed}
                        onChange={(e) =>
                          updateDaySetting(row.day_of_week, 'is_closed', e.target.checked)
                        }
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SERVICES ─── */}
      {activeSection === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Booking Services</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define what services customers can book, their duration, and buffer time
              </p>
            </div>
            <button
              onClick={() => setShowAddService(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Service
            </button>
          </div>

          {/* Add Service Form */}
          {showAddService && (
            <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-indigo-800">New Service</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Service Name
                  </label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Visa Consultation"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={newService.duration_minutes}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        duration_minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Buffer (minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newService.buffer_minutes}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        buffer_minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddService}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Adding…' : 'Add Service'}
                </button>
                <button
                  onClick={() => setShowAddService(false)}
                  className="px-4 py-2 bg-white text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Services List */}
          <div className="space-y-2">
            {services.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">
                No services yet. Add your first one above.
              </div>
            )}
            {services.map((service) => (
              <div
                key={service.id}
                className={`border rounded-lg p-4 bg-white transition-all ${
                  service.is_active
                    ? 'border-slate-200'
                    : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                {editingService?.id === service.id ? (
                  // Edit mode
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={editingService.name}
                        onChange={(e) =>
                          setEditingService((p) => p && { ...p, name: e.target.value })
                        }
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        min={5}
                        value={editingService.duration_minutes}
                        onChange={(e) =>
                          setEditingService(
                            (p) => p && { ...p, duration_minutes: Number(e.target.value) }
                          )
                        }
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Buffer (min)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editingService.buffer_minutes}
                        onChange={(e) =>
                          setEditingService(
                            (p) => p && { ...p, buffer_minutes: Number(e.target.value) }
                          )
                        }
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="sm:col-span-3 flex gap-2">
                      <button
                        onClick={handleSaveService}
                        disabled={loading}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingService(null)}
                        className="px-4 py-2 bg-white text-slate-600 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {service.name}
                        </p>
                        {!service.is_active && (
                          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ⏱ {service.duration_minutes} min appointment &nbsp;·&nbsp;
                        {service.buffer_minutes} min buffer gap
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditingService(service)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleService(service)}
                        disabled={loading}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                          service.is_active
                            ? 'text-yellow-700 border-yellow-200 bg-yellow-50 hover:bg-yellow-100'
                            : 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                        }`}
                      >
                        {service.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteService(service)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
