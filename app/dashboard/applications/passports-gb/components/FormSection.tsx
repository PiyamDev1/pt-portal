'use client'

import { Save, X } from 'lucide-react'
import { getGbPassportPrice, GB_SERVICE_TYPES } from '@/app/lib/gbPassportPricing'

interface FormData {
  applicantName: string
  applicantPassport: string
  pexNumber: string
  ageGroup: 'Adult' | 'Child'
  pages: '34' | '54'
  serviceType: 'Standard' | 'Fast Track 1wk' | 'Premium 1D'
}

interface FormSectionProps {
  showForm: boolean
  formData: FormData
  isSubmitting: boolean
  onInputChange: (e: any) => void
  onSubmit: () => void
  onToggle: () => void
}

export default function FormSection({
  showForm,
  formData,
  isSubmitting,
  onInputChange,
  onSubmit,
  onToggle
}: FormSectionProps) {
  const pricing = getGbPassportPrice(formData.ageGroup, formData.pages, formData.serviceType)

  return (
    <>
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-blue-600 shadow-md animate-fade-in-down space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Applicant */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">1. Applicant Details</h4>
              <div className="space-y-2">
                <input
                  name="applicantName"
                  value={formData.applicantName}
                  onChange={onInputChange}
                  placeholder="Full Name *"
                  className="w-full p-2 border rounded text-sm"
                  required
                />
                <input
                  name="applicantPassport"
                  value={formData.applicantPassport}
                  onChange={onInputChange}
                  placeholder="Existing Passport No (Optional)"
                  className="w-full p-2 border rounded text-sm font-mono uppercase"
                />
              </div>

              <div className="pt-2 space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. PEX Reference</h4>
                <input
                  name="pexNumber"
                  value={formData.pexNumber}
                  onChange={onInputChange}
                  placeholder="PEX-123456789 *"
                  className="w-full p-2 border border-blue-200 rounded text-sm font-mono uppercase bg-blue-50"
                  required
                />
              </div>
            </div>

            {/* Right Column: Service & Options */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Application Options</h4>

              {/* Age Group */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Age Group</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Adult', 'Child'].map((age) => (
                    <button
                      key={age}
                      onClick={() => onInputChange({ target: { name: 'ageGroup', value: age } })}
                      className={`p-2 rounded text-sm font-medium border ${
                        formData.ageGroup === age
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {age}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pages */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Page Count</label>
                <div className="grid grid-cols-2 gap-2">
                  {['34', '54'].map((pg) => (
                    <button
                      key={pg}
                      onClick={() => onInputChange({ target: { name: 'pages', value: pg } })}
                      className={`p-2 rounded text-sm font-medium border ${
                        formData.pages === pg
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {pg} Pages
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Type */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Service Type</label>
                <select
                  name="serviceType"
                  value={formData.serviceType}
                  onChange={onInputChange}
                  className="w-full p-2 border rounded text-sm bg-white"
                >
                  {GB_SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 p-4 rounded-lg border border-blue-100">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Financial Summary</h4>
            {pricing.price > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Our Cost</div>
                  <div className="text-2xl font-bold text-slate-700">£{pricing.cost.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-600 font-bold">Agency Price</div>
                  <div className="text-2xl font-bold text-blue-700">£{pricing.price.toFixed(2)}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                Service not available for this selection
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={onToggle}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={isSubmitting || pricing.price === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Application'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
