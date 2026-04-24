/**
 * Branches Tab
 * CRUD interface for branch and location records used across employee and module assignment.
 * Includes address/contact details and booking hours per branch.
 *
 * @module app/dashboard/settings/components/BranchesTab
 */

'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface BranchLocation {
  id: string
  name: string
  branch_code: string | null
  type: string
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  postcode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

interface BranchSettingRow {
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

interface BranchesTabProps {
  initialLocations: BranchLocation[]
  supabase: SupabaseClient
  loading: boolean
  setLoading: (loading: boolean) => void
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

export default function BranchesTab({
  initialLocations,
  supabase,
  loading,
  setLoading,
}: BranchesTabProps) {
  const router = useRouter()
  const [locations, setLocations] = useState<BranchLocation[]>(initialLocations)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [branchSubTab, setBranchSubTab] = useState<'details' | 'hours' | 'overrides'>('details')

  // Branch details edit state
  const [editDetails, setEditDetails] = useState<BranchLocation | null>(null)

  // Weekly hours state
  const [weeklySettings, setWeeklySettings] = useState<BranchSettingRow[]>([])
  const [hoursSaving, setHoursSaving] = useState(false)

  // Overrides state
  const [overrides, setOverrides] = useState<BranchScheduleOverride[]>([])
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

  const selectedBranch = locations.find((l) => l.id === selectedBranchId) ?? null

  const loadBranchSettings = async (locationId: string) => {
    try {
      const from = new Date()
      const to = new Date(from)
      to.setUTCDate(to.getUTCDate() + 60)

      const [weeklyRes, overridesRes] = await Promise.all([
        fetch(`/api/bookings/settings/branch?location_id=${locationId}`),
        fetch(`/api/bookings/settings/overrides?location_id=${locationId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`),
      ])

      const weeklyJson = await weeklyRes.json()
      const overridesJson = await overridesRes.json()

      const rows = (weeklyJson.settings || []) as BranchSettingRow[]
      setWeeklySettings(rows.length > 0 ? rows : buildDefaultWeek(locationId))
      setOverrides((overridesJson.overrides || []) as BranchScheduleOverride[])
    } catch {
      setWeeklySettings(buildDefaultWeek(locationId))
      setOverrides([])
    }
  }

  const openBranch = (branch: BranchLocation) => {
    setSelectedBranchId(branch.id)
    setEditDetails({ ...branch })
    setBranchSubTab('details')
    loadBranchSettings(branch.id)
  }

  const updateDay = (day: number, field: keyof BranchSettingRow, value: string | number | boolean | null) => {
    setWeeklySettings((prev) => prev.map((row) => (row.day_of_week === day ? { ...row, [field]: value } : row)))
  }

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: newBranchName, branch_code: newBranchCode, type: 'Branch' })
      .select()

    if (!error && data) {
      setLocations([...locations, data[0]])
      setNewBranchName('')
      setNewBranchCode('')
      toast.success('Branch added successfully')
    } else {
      toast.error('Error adding branch', { description: error?.message })
    }
    setLoading(false)
  }

  const saveDetails = async () => {
    if (!editDetails || !selectedBranchId) return
    setLoading(true)
    const { error } = await supabase.from('locations').update({
      name: editDetails.name,
      branch_code: editDetails.branch_code,
      address_line1: editDetails.address_line1 ?? null,
      address_line2: editDetails.address_line2 ?? null,
      city: editDetails.city ?? null,
      postcode: editDetails.postcode ?? null,
      country: editDetails.country ?? null,
      phone: editDetails.phone ?? null,
      email: editDetails.email ?? null,
    }).eq('id', selectedBranchId)

    if (!error) {
      setLocations(locations.map((l) => (l.id === selectedBranchId ? { ...l, ...editDetails } : l)))
      toast.success('Branch details saved')
      router.refresh()
    } else {
      toast.error('Error saving details', { description: error.message })
    }
    setLoading(false)
  }

  const saveWeekly = async () => {
    if (!selectedBranchId) return
    setHoursSaving(true)
    try {
      const res = await fetch('/api/bookings/settings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: selectedBranchId, settings: weeklySettings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Booking hours saved')
      await loadBranchSettings(selectedBranchId)
    } catch (err) {
      toast.error('Failed to save hours', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setHoursSaving(false)
    }
  }

  const saveOverride = async () => {
    if (!selectedBranchId || !newOverrideDate) {
      toast.error('Select a date for the one-off schedule')
      return
    }
    try {
      const res = await fetch('/api/bookings/settings/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: selectedBranchId, date: newOverrideDate, ...newOverride }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('One-off schedule saved')
      await loadBranchSettings(selectedBranchId)
    } catch (err) {
      toast.error('Failed to save override', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const deleteOverride = async (id: string) => {
    if (!selectedBranchId) return
    try {
      const res = await fetch(`/api/bookings/settings/overrides/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      toast.success('Override removed')
      await loadBranchSettings(selectedBranchId)
    } catch (err) {
      toast.error('Failed to remove override', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Branch */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="font-bold text-lg mb-4 text-slate-800">Add New Location</h3>
        <form onSubmit={handleAddBranch} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Branch Name
            </label>
            <input
              type="text"
              placeholder="e.g. Manchester Office"
              required
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
            />
          </div>
          <div className="w-32">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Code
            </label>
            <input
              type="text"
              placeholder="MAN-01"
              required
              className="w-full p-2 border rounded uppercase focus:ring-2 focus:ring-blue-500 outline-none"
              value={newBranchCode}
              onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
            />
          </div>
          <button
            disabled={loading}
            className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition-colors"
          >
            {loading ? 'Adding...' : 'Add Branch'}
          </button>
        </form>
      </div>

      {/* List Branches */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
            <tr>
              <th className="px-6 py-3">Location Name</th>
              <th className="px-6 py-3">Branch Code</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locations.map((loc) => (
              <tr key={loc.id} className={`hover:bg-slate-50 cursor-pointer ${selectedBranchId === loc.id ? 'bg-indigo-50' : ''}`}>
                <td className="px-6 py-3 font-medium text-slate-900">{loc.name}</td>
                <td className="px-6 py-3 font-mono text-slate-500">{loc.branch_code || '-'}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${loc.type === 'HQ' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {loc.type}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <button onClick={() => openBranch(loc)} className="text-blue-600 hover:text-blue-800 font-medium">
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Branch Management Panel */}
      {selectedBranch && editDetails && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="px-6 pt-5 pb-3 border-b border-slate-200">
            <h3 className="font-bold text-lg text-slate-800">{selectedBranch.name}</h3>
            <div className="flex gap-2 mt-3">
              {(['details', 'hours', 'overrides'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBranchSubTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize ${branchSubTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {tab === 'hours' ? 'Booking Hours' : tab === 'overrides' ? 'One-off Schedules' : 'Details'}
                </button>
              ))}
              <button onClick={() => setSelectedBranchId(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
                Close ✕
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Details Tab */}
            {branchSubTab === 'details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Branch Name</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.name}
                      onChange={(e) => setEditDetails({ ...editDetails, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Branch Code</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase"
                      value={editDetails.branch_code ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, branch_code: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Address Line 1</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.address_line1 ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, address_line1: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Address Line 2</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.address_line2 ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, address_line2: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">City</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.city ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, city: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Postcode</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase"
                      value={editDetails.postcode ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, postcode: e.target.value.toUpperCase() || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Country</label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.country ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, country: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phone</label>
                    <input
                      type="tel"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.phone ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, phone: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.email ?? ''}
                      onChange={(e) => setEditDetails({ ...editDetails, email: e.target.value || null })}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveDetails}
                    disabled={loading}
                    className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-indigo-700"
                  >
                    {loading ? 'Saving...' : 'Save Details'}
                  </button>
                </div>
              </div>
            )}

            {/* Booking Hours Tab */}
            {branchSubTab === 'hours' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">Configure branch opening hours, breaks and concurrent staff per day.</p>
                  <button
                    onClick={saveWeekly}
                    disabled={hoursSaving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-indigo-700"
                  >
                    {hoursSaving ? 'Saving...' : 'Save Hours'}
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

            {/* One-off Overrides Tab */}
            {branchSubTab === 'overrides' && (
              <div className="space-y-6">
                <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-medium text-slate-700">Add a one-off schedule override for a specific date.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Date</label>
                      <input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Open</label>
                      <input type="time" value={newOverride.open_time ?? ''} onChange={(e) => setNewOverride((p) => ({ ...p, open_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Close</label>
                      <input type="time" value={newOverride.close_time ?? ''} onChange={(e) => setNewOverride((p) => ({ ...p, close_time: e.target.value || null }))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 text-sm text-slate-600 pb-1.5">
                        <input type="checkbox" checked={newOverride.is_closed} onChange={(e) => setNewOverride((p) => ({ ...p, is_closed: e.target.checked }))} />
                        Closed
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Notes</label>
                      <input type="text" placeholder="e.g. Bank Holiday" value={newOverride.notes ?? ''} onChange={(e) => setNewOverride((p) => ({ ...p, notes: e.target.value || null }))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <button onClick={saveOverride} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                    Add Override
                  </button>
                </div>

                {overrides.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No overrides scheduled.</p>
                ) : (
                  <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Hours</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {overrides.map((o) => (
                        <tr key={o.id}>
                          <td className="px-3 py-2 font-medium">{o.date}</td>
                          <td className="px-3 py-2 text-slate-600">{o.is_closed ? '—' : `${o.open_time} – ${o.close_time}`}</td>
                          <td className="px-3 py-2">
                            {o.is_closed ? <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">Closed</span> : <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">Open</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{o.notes || '-'}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => deleteOverride(o.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
