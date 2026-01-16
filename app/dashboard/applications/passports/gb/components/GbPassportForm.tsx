'use client'
import { useState } from 'react'
import { Save, X, Calculator, AlertCircle } from 'lucide-react'
import { getGbPassportPrice, GB_SERVICE_TYPES, AgeGroup, PageCount, ServiceType } from '@/app/lib/gbPassportPricing'

export default function GbPassportForm({ isOpen, onClose, onSave, currentUserId }: any) {
  const [formData, setFormData] = useState({
    applicantName: '',
    applicantPassport: '', 
    pexNumber: '',
    ageGroup: 'Adult' as AgeGroup,
    pages: '34' as PageCount,
    serviceType: 'Standard' as ServiceType
  })

  // Real-time Pricing Calculation
  const pricing = getGbPassportPrice(formData.ageGroup, formData.pages, formData.serviceType)

  const handleSubmit = () => {
    onSave({ ...formData, currentUserId })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="bg-blue-900 text-white p-6 flex justify-between items-center">
            <div>
                <h2 className="font-bold text-lg">New GB Application</h2>
                <p className="text-blue-200 text-xs">Digital Check & Send Service</p>
            </div>
            <button onClick={onClose}><X className="w-5 h-5"/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Applicant Section */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase">Applicant</label>
                <input 
                    placeholder="Full Name"
                    className="w-full p-2 border rounded-md text-sm"
                    value={formData.applicantName}
                    onChange={e => setFormData({...formData, applicantName: e.target.value})}
                />
                <input 
                    placeholder="Passport No (Optional)"
                    className="w-full p-2 border rounded-md text-sm"
                    value={formData.applicantPassport}
                    onChange={e => setFormData({...formData, applicantPassport: e.target.value.toUpperCase()})}
                />
            </div>

            <div className="h-px bg-slate-100" />

            {/* Passport Details */}
            <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase">Application Details</label>
                
                {/* PEX Reference */}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">PEX Reference</label>
                    <input 
                        placeholder="PEX-123456789"
                        className="w-full p-2 border border-blue-200 rounded-md text-sm font-mono uppercase bg-blue-50"
                        value={formData.pexNumber}
                        onChange={e => setFormData({...formData, pexNumber: e.target.value.toUpperCase()})}
                    />
                </div>

                {/* Age Selection */}
                <div className="grid grid-cols-2 gap-3">
                    {['Adult', 'Child'].map((age) => (
                        <button 
                            key={age}
                            onClick={() => setFormData({...formData, ageGroup: age as AgeGroup})}
                            className={`p-2 rounded-md text-sm font-medium border ${formData.ageGroup === age ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                        >
                            {age}
                        </button>
                    ))}
                </div>

                {/* Page Count */}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Page Count</label>
                    <div className="flex gap-3">
                        {['34', '54'].map((pg) => (
                            <label key={pg} className="flex items-center gap-2 cursor-pointer border p-2 rounded-md flex-1 hover:bg-slate-50">
                                <input 
                                    type="radio" 
                                    checked={formData.pages === pg} 
                                    onChange={() => setFormData({...formData, pages: pg as PageCount})}
                                    className="text-blue-600"
                                />
                                <span className="text-sm">{pg} Pages</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Service Type */}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Service Type</label>
                    <select 
                        className="w-full p-2 border rounded-md text-sm bg-white"
                        value={formData.serviceType}
                        onChange={e => setFormData({...formData, serviceType: e.target.value as ServiceType})}
                    >
                        {GB_SERVICE_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                    <Calculator className="w-3 h-3" /> Financials
                </h4>
                
                {pricing.price > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-slate-500">Our Cost</div>
                            <div className="text-lg font-mono text-slate-700">£{pricing.cost.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-blue-600 font-bold">Agency Price</div>
                            <div className="text-2xl font-bold text-blue-700">£{pricing.price.toFixed(2)}</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-2 rounded">
                        <AlertCircle className="w-4 h-4" /> 
                        <span>Service not available for this selection</span>
                    </div>
                )}
            </div>

        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
            <button 
                onClick={handleSubmit}
                disabled={pricing.price === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" /> Save Application
            </button>
        </div>
      </div>
    </div>
  )
}
