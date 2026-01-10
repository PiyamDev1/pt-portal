'use client'
import { useState, useEffect, useMemo } from 'react'
import { Save, ChevronUp, Box, Globe } from 'lucide-react'

// Common nationalities to show at top of list
const COMMON_NATIONALITIES = ["United Kingdom", "Pakistan", "India", "Bangladesh", "United States", "Travel Document"];

export default function VisaForm({ isOpen, onClose, data, currentUserId, onSave, metadata }: any) {
  const [formData, setFormData] = useState<any>({
    internalTrackingNo: '',
    applicantName: '',
    applicantPassport: '',
    applicantDob: '',
    nationality: '', // NEW FIELD
    countryId: '',
    visaTypeName: '',
    validity: '',
    basePrice: 0,
    customerPrice: 0,
    isPartOfPackage: false,
    status: 'Pending'
  })

  // Load Data
  useEffect(() => {
    if (data) {
      setFormData({
        id: data.id,
        internalTrackingNo: data.internal_tracking_number,
        applicantName: `${data.applicants?.first_name} ${data.applicants?.last_name}`,
        applicantPassport: data.passport_number_used || data.applicants?.passport_number || '',
        applicantDob: data.applicants?.dob || '',
        nationality: '', // We don't strictly save nationality in visa_applications, maybe infer from passport or add field? For now, user re-selects or we default.
        countryId: data.visa_countries?.id || '',
        visaTypeName: data.visa_types?.name || '',
        validity: data.validity || '',
        basePrice: data.base_price || 0,
        customerPrice: data.customer_price || 0,
        isPartOfPackage: data.is_part_of_package || false,
        status: data.status
      })
    } else {
      setFormData({
        internalTrackingNo: '', applicantName: '', applicantPassport: '', applicantDob: '',
        nationality: '', countryId: '', visaTypeName: '', validity: '',
        basePrice: 0, customerPrice: 0, isPartOfPackage: false, status: 'Pending'
      })
    }
  }, [data, isOpen])

  // --- LOGIC ENGINE ---

  // 1. Get List of Nationalities (Merge Common with All Countries)
  const nationalityOptions = useMemo(() => {
    const allNames = metadata?.countries?.map((c:any) => c.name) || [];
    // Combine unique sorted list
    return Array.from(new Set([...COMMON_NATIONALITIES, ...allNames]));
  }, [metadata]);

  // 2. Filter Destinations based on Selected Nationality
  const availableDestinations = useMemo(() => {
    if (!formData.nationality) return metadata?.countries || []; // Show all if no nationality picked

    // Find all Visa Types that allow this nationality (or "Any")
    const validTypes = metadata?.types?.filter((t: any) => {
        const allowed = t.allowed_nationalities || [];
        return allowed.includes("Any") || allowed.includes(formData.nationality);
    });

    // Extract unique country IDs from valid types
    const validCountryIds = new Set(validTypes.map((t: any) => t.country_id));

    return metadata?.countries?.filter((c: any) => validCountryIds.has(c.id));
  }, [formData.nationality, metadata]);

  // 3. Filter Visa Types based on Destination AND Nationality
  const availableVisaTypes = useMemo(() => {
    if (!formData.countryId) return [];
    
    return metadata?.types?.filter((t: any) => {
        const matchCountry = t.country_id === formData.countryId;
        const allowed = t.allowed_nationalities || [];
        const matchNationality = !formData.nationality || allowed.includes("Any") || allowed.includes(formData.nationality);
        
        return matchCountry && matchNationality;
    }) || [];
  }, [formData.countryId, formData.nationality, metadata]);


  // Auto-fill Logic
  const handleTypeChange = (val: string) => {
     const matchedType = availableVisaTypes.find((t: any) => t.name.toLowerCase() === val.toLowerCase());
     let updates: any = { visaTypeName: val };
     
     if (matchedType) {
        if (formData.basePrice === 0) updates.basePrice = matchedType.default_cost;
        if (formData.customerPrice === 0) updates.customerPrice = matchedType.default_price;
        if (!formData.validity && matchedType.default_validity) updates.validity = matchedType.default_validity;
     }
     setFormData((prev: any) => ({ ...prev, ...updates }));
  }

  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async () => {
    if(!formData.countryId) return alert("Select a Destination")
    setIsSubmitting(true)
    await onSave({ ...formData, currentUserId })
    setIsSubmitting(false)
  }

  if (!isOpen) return null

  return (
    <div className="bg-white rounded-xl border border-purple-100 shadow-lg overflow-hidden mb-6 animate-in slide-in-from-top-4 duration-300">
        <div className="bg-purple-50 px-6 py-3 border-b border-purple-100 flex justify-between items-center">
            <h3 className="font-bold text-purple-800 flex items-center gap-2">
                {data ? 'Edit Application' : 'New Application'}
            </h3>
            <button onClick={onClose} className="text-purple-400 hover:text-purple-700 bg-white rounded-full p-1 shadow-sm"><ChevronUp className="w-4 h-4" /></button>
        </div>

        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Applicant */}
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
                    </div>
                </div>

                {/* 2. Visa Logic (Dynamic Filters) */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Visa Selection</h4>
                    <div className="space-y-3">
                        
                        {/* Nationality Filter */}
                        <div>
                            <label className="text-xs font-medium text-purple-700 flex items-center gap-1">
                                <Globe className="w-3 h-3"/> Nationality
                            </label>
                            <input 
                                list="nationality-list"
                                value={formData.nationality}
                                onChange={e => {
                                    // Reset child fields when nationality changes
                                    setFormData({...formData, nationality: e.target.value, countryId: '', visaTypeName: ''})
                                }}
                                className="w-full mt-1 p-2 bg-purple-50 border border-purple-200 rounded text-sm font-semibold text-purple-900 placeholder-purple-300"
                                placeholder="Start here..."
                            />
                            <datalist id="nationality-list">
                                {nationalityOptions.map((n: string) => <option key={n} value={n} />)}
                            </datalist>
                        </div>

                        {/* Destination (Filtered) */}
                        <div>
                            <label className="text-xs font-medium text-slate-700">Destination</label>
                            <select 
                                value={formData.countryId}
                                onChange={e => setFormData({...formData, countryId: e.target.value, visaTypeName: ''})}
                                disabled={!formData.nationality}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm focus:border-purple-500 disabled:opacity-50"
                            >
                                <option value="">{formData.nationality ? 'Select Destination...' : 'Select Nationality First'}</option>
                                {availableDestinations.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Visa Type (Filtered) */}
                        <div>
                            <label className="text-xs font-medium text-slate-700">Visa Type</label>
                            <select
                                value={formData.visaTypeName}
                                onChange={e => handleTypeChange(e.target.value)}
                                disabled={!formData.countryId}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm disabled:opacity-50"
                            >
                                <option value="">Select Type...</option>
                                {availableVisaTypes.map((t: any) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-700">Validity</label>
                            <input 
                                value={formData.validity}
                                onChange={e => setFormData({...formData, validity: e.target.value})}
                                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Financials */}
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
