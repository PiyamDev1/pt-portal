'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import VisaForm from './components/VisaForm'
import { loadVisaMetadata, saveVisaApplication } from '@/app/lib/visaApi'
import { VISA_TABLE_COLUMNS } from '@/app/lib/visaTableConfig'

export default function VisaApplicationsClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [metadata, setMetadata] = useState<any>({ countries: [], types: [] })

  const loadMetadata = async () => {
    try {
      const data = await loadVisaMetadata()
      setMetadata(data)
    } catch (err) {
      console.error('Failed to load metadata')
    }
  }

  useEffect(() => {
    loadMetadata()
  }, [])

  // Refresh metadata whenever the form is opened (e.g., after seeding)
  useEffect(() => {
    if (isFormOpen) {
      loadMetadata()
    }
  }, [isFormOpen])

  const handleSave = async (data: any) => {
    try {
        const payload = {
          ...data,
          countryId: data.countryId ? Number(data.countryId) : null,
        }
        if (!payload.countryId) {
          toast.error('Please select a country')
          return
        }
        
        await saveVisaApplication(payload)
        
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
                {VISA_TABLE_COLUMNS.map(col => (
                  <th key={col.key} className="p-4">{col.label}</th>
                ))}
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {initialData.length === 0 ? (
                <tr>
                  <td colSpan={VISA_TABLE_COLUMNS.length + 1} className="p-12 text-center text-slate-400 italic">
                    No visa applications yet. Click &quot;New Application&quot; to create one.
                  </td>
                </tr>
              ) : (
                initialData.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    {/* Applicant */}
                    <td className="p-4">
                      <div className="font-semibold text-slate-800 text-sm">
                        {item.applicants?.first_name} {item.applicants?.last_name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{item.passport_number_used}</div>
                    </td>
                    {/* Nationality */}
                    <td className="p-4 text-sm text-slate-600">{item.applicants?.nationality || '-'}</td>
                    {/* Country */}
                    <td className="p-4 text-sm text-slate-600">{item.visa_countries?.name || '-'}</td>
                    {/* Visa Type */}
                    <td className="p-4 text-sm text-slate-600">{item.visa_types?.name || '-'}</td>
                    {/* Validity */}
                    <td className="p-4 text-sm text-slate-600">{item.validity || '-'}</td>
                    {/* App No */}
                    <td className="p-4 text-sm text-slate-600 font-mono">{item.internal_tracking_number || '-'}</td>
                    {/* Price */}
                    <td className="p-4 text-sm font-semibold text-slate-800">£{item.customer_price?.toFixed(2) || '0.00'}</td>
                    {/* Status */}
                    <td className="p-4">
                      {(() => {
                        const statusColors: Record<string, string> = {
                          'Pending': 'bg-yellow-50 text-yellow-700 border-yellow-200',
                          'Approved': 'bg-green-50 text-green-700 border-green-200',
                          'Rejected': 'bg-red-50 text-red-700 border-red-200',
                          'Processing': 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                        const colors = statusColors[item.status] || 'bg-slate-50 text-slate-700 border-slate-200'
                        return (
                          <span className={`text-xs font-semibold px-2 py-1 rounded border ${colors}`}>
                            {item.status}
                          </span>
                        )
                      })()}
                    </td>
                    {/* Action */}
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
