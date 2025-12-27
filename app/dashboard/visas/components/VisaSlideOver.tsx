'use client'
import { useState, useEffect } from 'react'
import { X, Save, Box } from 'lucide-react'

export default function VisaSlideOver({ isOpen, onClose, data, currentUserId, onSave, metadata }: any) {
  const [formData, setFormData] = useState<any>({
    internalTrackingNo: '',
    applicantName: '',
    applicantPassport: '',
    applicantDob: '',
    countryName: '',
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
        countryName: data.visa_countries?.name || '',
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
        countryName: '', visaTypeName: '', validity: '',
        basePrice: 0, customerPrice: 0, isPartOfPackage: false, status: 'Pending'
      })
    }
  }, [data, isOpen])

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auto-fill Prices and Validity when Visa Type is selected from list
  const handleTypeChange = (val: string) => {
     // Find the type in metadata
     const matchedType = metadata?.types?.find((t: any) => t.name.toLowerCase() === val.toLowerCase());
     
     let updates: any = { visaTypeName: val };
     
     if (matchedType) {
        // Only auto-fill if prices are currently 0 (don't overwrite custom edits)
        if (formData.basePrice === 0) updates.basePrice = matchedType.default_cost;
        if (formData.customerPrice === 0) updates.customerPrice = matchedType.default_price;
        
        // Auto-fill validity based on name hints (Simple logic)
        if (!formData.validity) {
            if (val.includes('90 days')) updates.validity = '90 Days';
            if (val.includes('1yr')) updates.validity = '1 Year';
            if (val.includes('30 days')) updates.validity = '30 Days';
        }
     }
     
     setFormData((prev: any) => ({ ...prev, ...updates }));
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await onSave({ ...formData, currentUserId })
    setIsSubmitting(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        {/* HEADER: Purple Hint */}
        <div className="bg-purple-600 px-6 py-4 flex justify-between items-center text-white">
          <div>
            <h2 className="font-bold text-lg">{data ? 'Edit Visa Application' : 'New Visa Application'}</h2>
            <p className="text-purple-200 text-xs">Dynamic fields auto-save to database.</p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white"><X /></button>
        </div>

        {/* SCROLLABLE FORM */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
          {/* Section 1: Applicant */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Applicant Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="text-xs font-semibold text-slate-700">Passport No</label>
                <input
                  value={formData.applicantPassport}
                  onChange={e => setFormData({ ...formData, applicantPassport: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="A1234567"
                />
              </div>
              <div className="col-span-1">
                <label className="text-xs font-semibold text-slate-700">App No.</label>
                <input
                  value={formData.internalTrackingNo}
                  onChange={e => setFormData({ ...formData, internalTrackingNo: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="TRK-001"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  value={formData.applicantName}
                  onChange={e => setFormData({ ...formData, applicantName: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-700">Date of Birth</label>
                <input
                  type="date"
                  value={formData.applicantDob}
                  onChange={e => setFormData({ ...formData, applicantDob: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Visa Details */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visa Details</h3>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Destination Country</label>
              <input
                list="countries"
                value={formData.countryName}
                onChange={e => setFormData({ ...formData, countryName: e.target.value })}
                className="w-full mt-1 p-2 border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Type to search or add new..."
              />
              <datalist id="countries">
                {metadata?.countries?.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Visa Type</label>
                <input
                  list="visaTypes"
                  value={formData.visaTypeName}
                  onChange={e => handleTypeChange(e.target.value)}
                  className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. Tourist"
                />
                <datalist id="visaTypes">
                  {metadata?.types?.map((t: any) => <option key={t.id} value={t.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Validity</label>
                <input
                  value={formData.validity}
                  onChange={e => setFormData({ ...formData, validity: e.target.value })}
                  className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. 90 Days"
                />
              </div>
            </div>

            {/* Package Toggle */}
            <div className="flex items-center gap-3 pt-2">
              <div
                onClick={() => setFormData({ ...formData, isPartOfPackage: !formData.isPartOfPackage })}
                className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition-colors ${formData.isPartOfPackage ? 'bg-purple-600 border-purple-600' : 'bg-white border-slate-300'}`}
              >
                {formData.isPartOfPackage && <Box className="w-3 h-3 text-white" />}
              </div>
              <label className="text-sm text-slate-700 font-medium select-none cursor-pointer" onClick={() => setFormData({ ...formData, isPartOfPackage: !formData.isPartOfPackage })}>
                Mark as part of a Package
              </label>
            </div>
          </div>

          {/* Section 3: Financials */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Financials</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Our Cost</label>
                <div className="relative">
                  <span className="absolute left-2 top-1.5 text-slate-400 text-xs">£</span>
                  <input
                    type="number"
                    value={formData.basePrice}
                    onChange={e => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-6 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-purple-700">Agency Price</label>
                <div className="relative">
                  <span className="absolute left-2 top-1.5 text-purple-400 text-xs">£</span>
                  <input
                    type="number"
                    value={formData.customerPrice}
                    onChange={e => setFormData({ ...formData, customerPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-6 p-1.5 border border-purple-200 rounded-lg text-sm font-bold text-purple-700 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition"
          >
            {isSubmitting ? 'Saving...' : <><Save className="w-4 h-4" /> Save Record</>}
          </button>
        </div>
      </div>
    </div>
  )
}
