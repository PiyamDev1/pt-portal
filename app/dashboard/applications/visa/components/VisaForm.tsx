'use client'
import { useState, useEffect, useMemo } from 'react'
import { Save, X, Box, ChevronDown, ChevronUp } from 'lucide-react'

export default function VisaForm({ isOpen, onClose, data, currentUserId, onSave, metadata }: any) {
  const [formData, setFormData] = useState<any>({
    internalTrackingNo: '',
    applicantName: '',
    applicantPassport: '',
    applicantDob: '',
    applicantNationality: '',
    countryId: '', // CHANGED: Stores ID now
    visaTypeName: '',
    validity: '',
    basePrice: 0,
    customerPrice: 0,
    isPartOfPackage: false,
    status: 'Pending'
  })

  useEffect(() => {
    if (data) {
      setFormData({
        id: data.id,
        internalTrackingNo: data.internal_tracking_number,
        applicantName: `${data.applicants?.first_name} ${data.applicants?.last_name}`,
        applicantPassport: data.passport_number_used || data.applicants?.passport_number || '',
        applicantDob: data.applicants?.dob || '',
        applicantNationality: data.applicants?.nationality || '',
        countryId: data.visa_countries?.id || '', // Load ID
        visaTypeName: data.visa_types?.name || '',
        validity: data.validity || '',
        basePrice: data.base_price || 0,
        customerPrice: data.customer_price || 0,
        isPartOfPackage: data.is_part_of_package || false,
        status: data.status
      })
    } else {
      // Reset
      setFormData({
        internalTrackingNo: '', applicantName: '', applicantPassport: '', applicantDob: '',
                applicantNationality: '',
                countryId: '', visaTypeName: '', validity: '',
        basePrice: 0, customerPrice: 0, isPartOfPackage: false, status: 'Pending'
      })
    }
  }, [data, isOpen])

  const [isSubmitting, setIsSubmitting] = useState(false)
    const [showTypeDropdown, setShowTypeDropdown] = useState(false)

    // Filter visa types for selected country
    const availableVisaTypes = useMemo(() => {
        if (!formData.countryId) return []
        const allTypes = metadata?.types || []
        // Strict: only types explicitly tied to the selected country
        return allTypes.filter((t: any) => String(t.country_id) === String(formData.countryId))
    }, [formData.countryId, metadata])

    const filteredVisaTypes = useMemo(() => {
        if (!formData.countryId) return []
        const term = formData.visaTypeName?.trim().toLowerCase() || ''
        if (!term) return availableVisaTypes
        return availableVisaTypes.filter((t: any) => t.name.toLowerCase().includes(term))
    }, [availableVisaTypes, formData.countryId, formData.visaTypeName])

    // Auto-fill: pricing and validity
    const handleTypeChange = (val: string) => {
        const matchedType = availableVisaTypes.find((t: any) => t.displayName.toLowerCase() === val.toLowerCase())
        const updates: any = { visaTypeName: val }

        if (matchedType) {
            if (formData.basePrice === 0) updates.basePrice = matchedType.default_cost
            if (formData.customerPrice === 0) updates.customerPrice = matchedType.default_price
            if (matchedType.default_validity) updates.validity = matchedType.default_validity
        }
        setFormData((prev: any) => ({ ...prev, ...updates }))
    }

    // Auto-fill validity if we know the type default and the field is still empty
    useEffect(() => {
        if (!formData.countryId || !formData.visaTypeName) return
        const match = (metadata?.types || []).find(
            (t: any) => String(t.country_id) === String(formData.countryId) && t.name.toLowerCase() === formData.visaTypeName.toLowerCase()
        )
        if (match?.default_validity) {
            setFormData((prev: any) => ({ ...prev, validity: match.default_validity }))
        }
    }, [formData.countryId, formData.visaTypeName, metadata])

  const handleSubmit = async () => {
    if(!formData.countryId) {
        alert("Please select a Country");
        return;
    }
    setIsSubmitting(true)
    await onSave({ ...formData, currentUserId })
    setIsSubmitting(false)
  }

  if (!isOpen) return null

  return (
    <div className="bg-white rounded-xl border border-purple-100 shadow-lg overflow-hidden mb-6 animate-in slide-in-from-top-4 duration-300">
        {/* Header */}
        <div className="bg-purple-50 px-6 py-3 border-b border-purple-100 flex justify-between items-center">
            <h3 className="font-bold text-purple-800 flex items-center gap-2">
                {data ? 'Edit Application' : 'New Application'}
            </h3>
            <button onClick={onClose} className="text-purple-400 hover:text-purple-700 bg-white rounded-full p-1 shadow-sm">
                <ChevronUp className="w-4 h-4" />
            </button>
        </div>

        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Column 1: Applicant */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Applicant</h4>
                    <div className="space-y-3">
                         <div>
                            <label className="text-xs font-medium text-slate-700">Passport No</label>
                            <input 
                                value={formData.applicantPassport}
                                onChange={e => setFormData({...formData, applicantPassport: e.target.value.toUpperCase()})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                placeholder="A1234567"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700">Full Name</label>
                            <input 
                                value={formData.applicantName}
                                onChange={e => setFormData({...formData, applicantName: e.target.value})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm"
                            />
                        </div>
                         <div>
                            <label className="text-xs font-medium text-slate-700">Date of Birth</label>
                            <input 
                                type="date"
                                value={formData.applicantDob}
                                onChange={e => setFormData({...formData, applicantDob: e.target.value})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700">Nationality</label>
                            <select
                                value={formData.applicantNationality}
                                onChange={e => setFormData({ ...formData, applicantNationality: e.target.value })}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm"
                            >
                                <option value="">Select Nationality...</option>
                                {metadata?.countries?.map((c: any) => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Column 2: Visa Details */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Visa Details</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-700">Country</label>
                            {/* FIXED: Dropdown Select */}
                            <select 
                                value={formData.countryId}
                                onChange={e => setFormData({...formData, countryId: e.target.value, visaTypeName: ''})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm focus:border-purple-500"
                            >
                                <option value="">Select Country...</option>
                                {metadata?.countries?.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                                                <div>
                                                        <label className="text-xs font-medium text-slate-700">Visa Type</label>
                                                        <div className="relative">
                                                            <input 
                                                                    value={formData.visaTypeName}
                                                                    onChange={e => { setShowTypeDropdown(true); handleTypeChange(e.target.value) }}
                                                                    onFocus={() => setShowTypeDropdown(true)}
                                                                    onBlur={() => setTimeout(() => setShowTypeDropdown(false), 120)}
                                                                    disabled={!formData.countryId}
                                                                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    placeholder={!formData.countryId ? "Select Country First" : "Select or Type New..."}
                                                            />
                                                            {showTypeDropdown && formData.countryId && (
                                                                <div className="absolute z-10 mt-1 w-full max-h-52 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                                                    {filteredVisaTypes.length > 0 ? (
                                                                        filteredVisaTypes.map((t: any) => (
                                                                            <button
                                                                                key={t.id}
                                                                                type="button"
                                                                                onMouseDown={(e) => { e.preventDefault(); handleTypeChange(t.name); setShowTypeDropdown(false) }}
                                                                                className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50"
                                                                            >
                                                                                {t.name}
                                                                            </button>
                                                                        ))
                                                                    ) : (
                                                                        <div className="px-3 py-2 text-xs text-slate-500">
                                                                            No visa types for this country.
                                                                        </div>
                                                                    )}

                                                                    {/* Create new option */}
                                                                    {formData.visaTypeName.trim() && !availableVisaTypes.some((t: any) => t.name.toLowerCase() === formData.visaTypeName.trim().toLowerCase()) && (
                                                                        <button
                                                                            type="button"
                                                                            onMouseDown={(e) => { e.preventDefault(); handleTypeChange(formData.visaTypeName.trim()); setShowTypeDropdown(false) }}
                                                                            className="w-full text-left px-3 py-2 text-sm bg-purple-50 text-purple-800 hover:bg-purple-100 border-t border-purple-100"
                                                                        >
                                                                            Create new type: {formData.visaTypeName.trim()}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700">Validity</label>
                            <input 
                                value={formData.validity}
                                onChange={e => setFormData({...formData, validity: e.target.value})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm"
                                placeholder="e.g. 90 Days"
                            />
                        </div>
                    </div>
                </div>

                {/* Column 3: Admin & Financials */}
                <div className="space-y-4">
                     <h4 className="text-xs font-bold text-slate-400 uppercase">Office Use</h4>
                     <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-700">App No.</label>
                            <input 
                                value={formData.internalTrackingNo}
                                onChange={e => setFormData({...formData, internalTrackingNo: e.target.value.toUpperCase()})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm font-mono"
                                placeholder="TRK-001"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500">Our Cost</label>
                                <div className="relative">
                                    <span className="absolute left-2 top-1.5 text-slate-400 text-xs">£</span>
                                    <input 
                                        type="number"
                                        value={formData.basePrice}
                                        onChange={e => setFormData({...formData, basePrice: parseFloat(e.target.value)})}
                                        className="w-full pl-6 p-1.5 bg-slate-50 border border-slate-200 rounded text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-purple-700">Agency Price</label>
                                <div className="relative">
                                    <span className="absolute left-2 top-1.5 text-purple-400 text-xs">£</span>
                                    <input 
                                        type="number"
                                        value={formData.customerPrice}
                                        onChange={e => setFormData({...formData, customerPrice: parseFloat(e.target.value)})}
                                        className="w-full pl-6 p-1.5 bg-white border border-purple-300 rounded text-sm font-bold text-purple-700"
                                    />
                                </div>
                            </div>
                        </div>
                        
                        {/* Package Toggle */}
                        <div 
                            onClick={() => setFormData({...formData, isPartOfPackage: !formData.isPartOfPackage})}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${formData.isPartOfPackage ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200'}`}
                        >
                             <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.isPartOfPackage ? 'bg-purple-600 border-purple-600' : 'bg-white border-slate-300'}`}>
                                {formData.isPartOfPackage && <Box className="w-3 h-3 text-white" />}
                             </div>
                             <span className="text-xs font-medium text-slate-700">Part of Package</span>
                        </div>
                     </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium">Cancel</button>
                <button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm shadow-purple-200"
                >
                    {isSubmitting ? 'Saving...' : <><Save className="w-4 h-4" /> Save Application</>}
                </button>
            </div>
        </div>
    </div>
  )
}