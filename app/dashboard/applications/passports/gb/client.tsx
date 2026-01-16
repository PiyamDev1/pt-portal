'use client'

import { useState } from 'react'
import { Plus, Search, MoreHorizontal, User, FileText } from 'lucide-react'
import { toast } from 'sonner'
import GbPassportForm from './components/GbPassportForm'
import { useRouter } from 'next/navigation'

export default function GbPassportsClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)

  const handleSave = async (data: any) => {
    try {
        const res = await fetch('/api/passports/gb/add', {
            method: 'POST',
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error("Failed to save")
        
        toast.success("GB Application Created")
        setIsFormOpen(false)
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
                placeholder="Search by Name, PEX, etc..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
        </div>
        <button 
            onClick={() => setIsFormOpen(true)}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-md"
        >
            <Plus className="w-4 h-4" /> New Application
        </button>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
                <tr>
                    <th className="p-4">Applicant</th>
                    <th className="p-4">Service Details</th>
                    <th className="p-4">PEX Ref</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {filtered.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                                    <User className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-800 text-sm">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                                </div>
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="space-y-1">
                                <div className="text-sm font-medium text-slate-700">{item.service_type}</div>
                                <div className="flex gap-2">
                                    <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                        {item.age_group}
                                    </span>
                                    <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                        {item.pages} Pages
                                    </span>
                                </div>
                            </div>
                        </td>
                        <td className="p-4">
                            <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded">
                                {item.pex_number || 'N/A'}
                            </span>
                        </td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase
                                ${item.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700 border border-yellow-100'}`}>
                                {item.status}
                            </span>
                        </td>
                        <td className="p-4 text-right">
                            <button className="text-slate-300 hover:text-blue-600 p-2 hover:bg-slate-100 rounded">
                                <MoreHorizontal className="w-5 h-5" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      <GbPassportForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        currentUserId={currentUserId}
      />
    </div>
  )
}
