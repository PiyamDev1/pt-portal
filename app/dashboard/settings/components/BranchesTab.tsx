/**
 * Branches Tab
 * CRUD interface for branch and location records used across employee and module assignment.
 * Includes address/contact details and booking hours per branch.
 *
 * @module app/dashboard/settings/components/BranchesTab
 */

'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BookingScheduleOverridesEditor,
  BookingWeeklyScheduleEditor,
  useBookingScheduleSettings,
} from './BookingScheduleSettings'

interface BranchLocation {
  id: string
  name: string
  branch_code: string | null
  type: string
  appointments_enabled?: boolean | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  postcode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

interface BranchesTabProps {
  initialLocations: BranchLocation[]
  supabase: SupabaseClient
  loading: boolean
  setLoading: (loading: boolean) => void
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
  const schedule = useBookingScheduleSettings(selectedBranchId)

  // Branch details edit state
  const [editDetails, setEditDetails] = useState<BranchLocation | null>(null)

  const selectedBranch = locations.find((l) => l.id === selectedBranchId) ?? null

  const openBranch = (branch: BranchLocation) => {
    setSelectedBranchId(branch.id)
    setEditDetails({ ...branch })
    setBranchSubTab('details')
  }

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase
      .from('locations')
      .insert({
        name: newBranchName,
        branch_code: newBranchCode,
        type: 'Branch',
        appointments_enabled: true,
      })
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
    const { error } = await supabase
      .from('locations')
      .update({
        name: editDetails.name,
        branch_code: editDetails.branch_code,
        appointments_enabled: editDetails.appointments_enabled ?? true,
        address_line1: editDetails.address_line1 ?? null,
        address_line2: editDetails.address_line2 ?? null,
        city: editDetails.city ?? null,
        postcode: editDetails.postcode ?? null,
        country: editDetails.country ?? null,
        phone: editDetails.phone ?? null,
        email: editDetails.email ?? null,
      })
      .eq('id', selectedBranchId)

    if (!error) {
      setLocations(locations.map((l) => (l.id === selectedBranchId ? { ...l, ...editDetails } : l)))
      toast.success('Branch details saved')
      router.refresh()
    } else {
      toast.error('Error saving details', { description: error.message })
    }
    setLoading(false)
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
              <tr
                key={loc.id}
                className={`hover:bg-slate-50 cursor-pointer ${selectedBranchId === loc.id ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-6 py-3 font-medium text-slate-900">{loc.name}</td>
                <td className="px-6 py-3 font-mono text-slate-500">{loc.branch_code || '-'}</td>
                <td className="px-6 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${loc.type === 'HQ' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}
                  >
                    {loc.type}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <button
                    onClick={() => openBranch(loc)}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
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
                  {tab === 'hours'
                    ? 'Booking Hours'
                    : tab === 'overrides'
                      ? 'One-off Schedules'
                      : 'Details'}
                </button>
              ))}
              <button
                onClick={() => setSelectedBranchId(null)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600"
              >
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
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Branch Name
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.name}
                      onChange={(e) => setEditDetails({ ...editDetails, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Branch Code
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase"
                      value={editDetails.branch_code ?? ''}
                      onChange={(e) =>
                        setEditDetails({
                          ...editDetails,
                          branch_code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Address Line 1
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.address_line1 ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, address_line1: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Address Line 2
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.address_line2 ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, address_line2: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      City
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.city ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, city: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Postcode
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase"
                      value={editDetails.postcode ?? ''}
                      onChange={(e) =>
                        setEditDetails({
                          ...editDetails,
                          postcode: e.target.value.toUpperCase() || null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Country
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.country ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, country: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Appointments
                    </label>
                    <label className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editDetails.appointments_enabled ?? true}
                        onChange={(e) =>
                          setEditDetails({ ...editDetails, appointments_enabled: e.target.checked })
                        }
                      />
                      This branch accepts appointments
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.phone ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, phone: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      value={editDetails.email ?? ''}
                      onChange={(e) =>
                        setEditDetails({ ...editDetails, email: e.target.value || null })
                      }
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

            {branchSubTab === 'hours' && <BookingWeeklyScheduleEditor model={schedule} />}

            {branchSubTab === 'overrides' && <BookingScheduleOverridesEditor model={schedule} />}
          </div>
        </div>
      )}
    </div>
  )
}
