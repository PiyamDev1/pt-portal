'use client'
import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'

export default function VisaSlideOver({ isOpen, onClose, data, currentUserId, onSave }: any) {
  const [formData, setFormData] = useState<any>({
    internalTrackingNo: '',
    applicantName: '',
    applicantPassport: '',
    countryName: '',
    visaTypeName: '',
    validity: '',
    basePrice: 0,
    customerPrice: 0,
    notes: '',
    status: 'Pending'
  })

  // Load data when opening for Edit
  useEffect(() => {
    if (data) {
      setFormData({
        id: data.id,
        internalTrackingNo: data.internal_tracking_number,
        applicantName: `${data.applicants?.first_name} ${data.applicants?.last_name}`,
        applicantPassport: data.passport_number_used || data.applicants?.passport_number,
        countryName: data.visa_countries?.name || '',
        visaTypeName: data.visa_types?.name || '',
        validity: data.validity || '',
        basePrice: data.base_price || 0,
        customerPrice: data.customer_price || 0,
        notes: data.notes || '',
        status: data.status
      })
    } else {
      // Reset for New Entry
      setFormData({
        internalTrackingNo: '',
        applicantName: '',
        applicantPassport: '',
        countryName: '',
        visaTypeName: '',
        validity: '',
        basePrice: 0,
        customerPrice: 0,
        notes: '',
        status: 'Pending'
      })
    }
  }, [data, isOpen])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const profit = (formData.customerPrice || 0) - (formData.basePrice || 0)

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
            <p className="text-purple-200 text-xs">Enter details below. New Countries/Types will be auto-saved.</p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white">
            <X className="w-5 h-5" />
          </button>
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
            </div>
          </div>

          {/* Section 2: Visa Details (Dynamic) */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visa Details</h3>
              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Dynamic Fields</span>
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
                <option value="Turkey" />
                <option value="Dubai" />
                <option value="United Kingdom" />
                <option value="Schengen" />
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Visa Type</label>
                <input
                  list="visaTypes"
                  value={formData.visaTypeName}
                  onChange={e => setFormData({ ...formData, visaTypeName: e.target.value })}
                  className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. Tourist"
                />
                <datalist id="visaTypes">
                  <option value="Tourist" />
                  <option value="Business" />
                  <option value="E-Visa" />
                  <option value="Sticker" />
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
                <label className="text-xs font-semibold text-purple-700">Agency Price (Sold)</label>
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

            {/* Profit Calculator */}
            <div className={`p-3 rounded-lg flex justify-between items-center ${profit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span className="text-xs font-medium">Estimated Profit</span>
              <span className="font-bold text-lg">£{profit.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-700">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm h-20 focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Checklist, reminders..."
            />
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
