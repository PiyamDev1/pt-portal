'use client'

import { useState } from 'react'
import { Plus, Search, MoreHorizontal, User, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import FormSection from './components/FormSection'
import { useRouter } from 'next/navigation'

interface FormData {
  applicantName: string
  applicantPassport: string
  pexNumber: string
  ageGroup: 'Adult' | 'Child'
  pages: '34' | '54'
  serviceType: 'Standard' | 'Fast Track 1wk' | 'Premium 1D'
}

export default function GbPassportsClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState<FormData>({
    applicantName: '',
    applicantPassport: '',
    pexNumber: '',
    ageGroup: 'Adult',
    pages: '34',
    serviceType: 'Standard'
  })

  const handleInputChange = (e: any) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    if (!formData.applicantName || !formData.pexNumber) {
      toast.error('Please fill all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/passports/gb/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, currentUserId })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save')
      }

      toast.success('GB Application Created Successfully')
      setFormData({
        applicantName: '',
        applicantPassport: '',
        pexNumber: '',
        ageGroup: 'Adult',
        pages: '34',
        serviceType: 'Standard'
      })
      setShowForm(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const filtered = initialData.filter((item: any) =>
    JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Search & Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search by Name, PEX, etc..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
          />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-slate-800 flex items-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" /> {showForm ? 'Close' : 'New Application'}
        </button>
      </div>

      {/* Form Section */}
      <FormSection
        showForm={showForm}
        formData={formData}
        isSubmitting={isSubmitting}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onToggle={() => setShowForm(!showForm)}
      />

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
            <tr>
              <th className="p-4">Applicant</th>
              <th className="p-4">Service Details</th>
              <th className="p-4">PEX Ref</th>
              <th className="p-4">Prices</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">
                        {item.applicants?.first_name} {item.applicants?.last_name}
                      </div>
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
                  <span className="font-mono text-xs bg-slate-900 text-white border border-slate-900 px-2 py-1 rounded">
                    {item.pex_number || 'N/A'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="space-y-1 text-xs">
                    <div className="text-slate-500">Cost: <span className="font-mono">£{item.cost_price?.toFixed(2)}</span></div>
                    <div className="text-slate-900 font-bold">Price: <span className="font-mono">£{item.sale_price?.toFixed(2)}</span></div>
                  </div>
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
    </div>
  )
}
