'use client'

import { useState } from 'react'
import { Plus, Search, MoreHorizontal, User, MapPin, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import VisaSlideOver from './components/VisaSlideOver'

export default function VisasClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isSlideOpen, setIsSlideOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const handleSave = async (data: any) => {
    try {
      const res = await fetch('/api/visas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast.success('Visa Application Saved')
      setIsSlideOpen(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const filtered = initialData.filter(item => {
    const query = searchTerm.toLowerCase()
    const fullName = `${item.applicants?.first_name || ''} ${item.applicants?.last_name || ''}`.toLowerCase()
    const country = (item.visa_countries?.name || '').toLowerCase()
    return (
      fullName.includes(query) || 
      country.includes(query) || 
      (item.internal_tracking_number || '').toLowerCase().includes(query) ||
      (item.passport_number_used || '').toLowerCase().includes(query)
    )
  })

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
          onClick={() => {
            setEditingItem(null)
            setIsSlideOpen(true)
          }}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                  No visa applications found.
                </td>
              </tr>
            ) : (
              filtered.map((item: any) => (
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
                    <button 
                      onClick={() => {
                        setEditingItem(item)
                        setIsSlideOpen(true)
                      }}
                      className="text-slate-400 hover:text-purple-600 transition"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* VISA SLIDE-OVER */}
      <VisaSlideOver
        isOpen={isSlideOpen}
        onClose={() => setIsSlideOpen(false)}
        data={editingItem}
        currentUserId={currentUserId}
        onSave={handleSave}
      />
    </div>
  )
}
