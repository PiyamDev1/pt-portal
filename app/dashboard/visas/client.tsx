'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, MoreHorizontal, User, MapPin, Box } from 'lucide-react'
import { toast } from 'sonner'
import VisaSlideOver from './components/VisaSlideOver'
import { useRouter } from 'next/navigation'

export default function VisasClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isSlideOpen, setIsSlideOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  
  // Metadata State
  const [metadata, setMetadata] = useState<any>({ countries: [], types: [] })

  useEffect(() => {
    // Fetch metadata for dropdowns and auto-pricing
    fetch('/api/visas/metadata')
      .then(res => res.json())
      .then(data => setMetadata(data))
      .catch(err => console.error("Metadata Load Error", err))
  }, [])

  const handleSave = async (data: any) => {
    try {
        const res = await fetch('/api/visas/save', {
            method: 'POST',
            body: JSON.stringify(data)
        })
        const result = await res.json()
        if(!res.ok) throw new Error(result.error)
        
        toast.success('Visa Application Saved')
        setIsSlideOpen(false)
        router.refresh()
    } catch (e: any) {
        toast.error(e.message)
    }
  }

  const filtered = initialData.filter((item: any) => 
    JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
                placeholder="Search Application No, Passport, Name..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
        </div>
        <button 
            onClick={() => { setEditingItem(null); setIsSlideOpen(true) }}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-purple-700 flex items-center gap-2 shadow-md shadow-purple-100"
        >
            <Plus className="w-4 h-4" /> New Application
        </button>
      </div>

      {/* 2. Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
                <tr>
                    <th className="p-4">Applicant</th>
                    <th className="p-4">Visa Details</th>
                    <th className="p-4">App No.</th>
                    <th className="p-4">Agency Price</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {filtered.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                                    <User className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-800 text-sm">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                                    <div className="text-xs text-slate-400 font-mono">{item.passport_number_used}</div>
                                </div>
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    {item.visa_countries?.name}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                        {item.visa_types?.name}
                                    </span>
                                    {item.validity && (
                                        <span className="text-[10px] bg-green-50 border border-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                            {item.validity}
                                        </span>
                                    )}
                                    {item.is_part_of_package && (
                                        <span className="text-[10px] bg-blue-50 border border-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <Box className="w-3 h-3"/> Package
                                        </span>
                                    )}
                                </div>
                            </div>
                        </td>
                        <td className="p-4">
                            <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                {item.internal_tracking_number}
                            </span>
                        </td>
                        <td className="p-4">
                            <div className="font-bold text-slate-700">£{item.customer_price}</div>
                        </td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase
                                ${item.status === 'Completed' ? 'bg-green-100 text-green-700' : 
                                  item.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-yellow-50 text-yellow-700 border border-yellow-100'
                                }`}>
                                {item.status}
                            </span>
                        </td>
                        <td className="p-4 text-right">
                            <button 
                                onClick={() => { setEditingItem(item); setIsSlideOpen(true) }}
                                className="text-slate-300 hover:text-purple-600 transition-colors"
                            >
                                <MoreHorizontal className="w-5 h-5" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      <VisaSlideOver 
        isOpen={isSlideOpen} 
        onClose={() => setIsSlideOpen(false)} 
        data={editingItem}
        currentUserId={currentUserId}
        onSave={handleSave}
        metadata={metadata} // PASS METADATA HERE
      />
    </div>
  )
}
