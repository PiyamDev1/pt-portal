'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import VisaForm from './components/VisaForm'

export default function VisaApplicationsClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [metadata, setMetadata] = useState<any>({ countries: [], types: [] })

  const loadMetadata = async () => {
    try {
      const res = await fetch('/api/visas/metadata')
      const data = await res.json()
      setMetadata(data)
    } catch (err) {
      console.error('Metadata Load Error', err)
    }
  }

  useEffect(() => {
    loadMetadata()
  }, [])

  const handleSave = async (data: any) => {
    try {
        const payload = {
          ...data,
          countryId: data.countryId ? Number(data.countryId) : null,
        }
        const res = await fetch('/api/visas/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const result = await res.json()
        if(!res.ok) throw new Error(result.error)
        
        toast.success('Visa Application Saved')
        await loadMetadata()
        setIsFormOpen(false)
        setEditingItem(null)
        router.refresh()
    } catch (e: any) {
        toast.error(e.message || 'Failed to save application')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Visa Applications</h1>
          <p className="text-slate-500 text-sm">Manage visa applications and track processing</p>
        </div>
        <button 
          onClick={() => { setEditingItem(null); setIsFormOpen(!isFormOpen) }}
          className="bg-purple-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-purple-700 flex items-center gap-2 shadow-md shadow-purple-100"
        >
          {isFormOpen ? <ChevronDown className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isFormOpen ? 'Hide Form' : 'New Application'}
        </button>
      </div>

      <VisaForm 
        isOpen={isFormOpen} 
        onClose={() => { setIsFormOpen(false); setEditingItem(null) }} 
        data={editingItem}
        currentUserId={currentUserId}
        onSave={handleSave}
        metadata={metadata}
      />

      {/* Table View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="p-4">Applicant</th>
                <th className="p-4">Country</th>
                <th className="p-4">Visa Type</th>
                <th className="p-4">Validity</th>
                <th className="p-4">App No.</th>
                <th className="p-4">Price</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {initialData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 italic">
                    No visa applications yet. Click "New Application" to create one.
                  </td>
                </tr>
              ) : (
                initialData.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <div className="font-semibold text-slate-800 text-sm">
                        {item.applicants?.first_name} {item.applicants?.last_name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{item.passport_number_used}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-700">{item.visa_countries?.name}</td>
                    <td className="p-4">
                      <span className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-600">
                        {item.visa_types?.name}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{item.validity || '-'}</td>
                    <td className="p-4">
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                        {item.internal_tracking_number}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-700">£{item.customer_price}</td>
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
                        onClick={() => { setEditingItem(item); setIsFormOpen(true) }}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
