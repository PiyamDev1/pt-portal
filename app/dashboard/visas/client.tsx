'use client'

import React, { useState, useEffect } from 'react'
import { Search, Plus, MoreHorizontal, User, Calendar, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function VisasClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Metadata for Dropdowns
  const [countries, setCountries] = useState<any[]>([])
  const [visaTypes, setVisaTypes] = useState<any[]>([])

  // Form State
  const [formData, setFormData] = useState({
    applicantName: '',
    applicantPassport: '',
    countryId: '',
    visaTypeId: '',
    internalTrackingNo: '',
    customerPrice: 0,
    notes: ''
  })

  // Fetch Metadata on Mount
  useEffect(() => {
    fetch('/api/visas/metadata')
      .then(res => res.json())
      .then(data => {
        setCountries(data.countries || [])
        setVisaTypes(data.types || [])
      })
      .catch(err => console.error('Failed to load metadata:', err))
  }, [])

  const handleCreate = async () => {
    if (!formData.applicantName || !formData.countryId) {
      toast.error('Please fill required fields')
      return
    }
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/visas/add-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, currentUserId })
      })
      const result = await res.json()

      if (!res.ok) throw new Error(result.error)

      toast.success('Visa Application Created')
      setIsModalOpen(false)
      router.refresh()
      setFormData({
        applicantName: '',
        applicantPassport: '',
        countryId: '',
        visaTypeId: '',
        internalTrackingNo: '',
        customerPrice: 0,
        notes: ''
      })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredData = initialData.filter((item: any) =>
    JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-grow w-full md:max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search visas..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 shadow-md flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> New Visa
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-200">
            <tr>
              <th className="p-5">Applicant</th>
              <th className="p-5">Destination & Type</th>
              <th className="p-5">Tracking</th>
              <th className="p-5">Status</th>
              <th className="p-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                  No visa applications found.
                </td>
              </tr>
            ) : (
              filteredData.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">
                          {item.applicants?.first_name} {item.applicants?.last_name}
                        </div>
                        <div className="text-xs text-slate-500">{item.passport_number_used}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium text-sm">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {item.visa_countries?.name}
                      </div>
                      <span className="inline-flex text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 border border-slate-200 w-fit">
                        {item.visa_types?.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded inline-block text-slate-600">
                      {item.internal_tracking_number}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(item.application_date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-5">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                      {item.status}
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    <button className="text-slate-400 hover:text-purple-600 transition">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* NEW VISA MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">New Visa Application</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Tracking No</label>
                  <input
                    className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm"
                    value={formData.internalTrackingNo}
                    onChange={e =>
                      setFormData({ ...formData, internalTrackingNo: e.target.value.toUpperCase() })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Passport No</label>
                  <input
                    className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm"
                    value={formData.applicantPassport}
                    onChange={e =>
                      setFormData({ ...formData, applicantPassport: e.target.value.toUpperCase() })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Applicant Name</label>
                <input
                  className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm"
                  value={formData.applicantName}
                  onChange={e => setFormData({ ...formData, applicantName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Country</label>
                  <select
                    className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    value={formData.countryId}
                    onChange={e => setFormData({ ...formData, countryId: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {countries.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Visa Type</label>
                  <select
                    className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    value={formData.visaTypeId}
                    onChange={e => setFormData({ ...formData, visaTypeId: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {visaTypes.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Price (GBP)</label>
                <input
                  type="number"
                  className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm"
                  value={formData.customerPrice}
                  onChange={e => setFormData({ ...formData, customerPrice: parseFloat(e.target.value) })}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-500 font-medium hover:bg-slate-100 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Saving...' : 'Create Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
