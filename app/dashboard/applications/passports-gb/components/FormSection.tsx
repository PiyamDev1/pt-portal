'use client'

import { Save } from 'lucide-react'
import { useMemo } from 'react'

interface FormData {
  applicantName: string
  applicantPassport: string
  dateOfBirth: string
  pexNumber: string
  ageGroup: string
  pages: string
  serviceType: string
}

interface FormSectionProps {
  showForm: boolean
  formData: FormData
  isSubmitting: boolean
  onInputChange: (e: any) => void
  onSubmit: () => void
  onToggle: () => void
  metadata: any // <--- New Prop
}

export default function FormSection({
  showForm,
  formData,
  isSubmitting,
  onInputChange,
  onSubmit,
  onToggle,
  metadata
}: FormSectionProps) {
  
  // Real-time price lookup from Metadata
  const pricing = useMemo(() => {
    if (!formData.ageGroup || !formData.pages || !formData.serviceType) return { cost: 0, price: 0 }
    
    const rule = metadata.pricing.find((p: any) => 
        p.age === formData.ageGroup && 
        p.pages === formData.pages && 
        p.service === formData.serviceType
    )
    return rule ? { cost: rule.cost, price: rule.price } : { cost: 0, price: 0 }
  }, [formData, metadata])

  return (
    <>
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-slate-900 shadow-md animate-fade-in-down space-y-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Existing Passport</label>
                    <input
                      name="applicantPassport"
                      value={formData.applicantPassport}
                      onChange={onInputChange}
                      placeholder="Passport No (Optional)"
                      className="w-full p-2 border rounded text-sm font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Date of Birth</label>
                    <input
                      name="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={onInputChange}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. PEX Reference</h4>
                <input
                  name="pexNumber"
                  value={formData.pexNumber}
                  onChange={onInputChange}
                  placeholder="PEX-123456789 *"
                  className="w-full p-2 border border-slate-800 rounded text-sm font-mono uppercase bg-slate-50"
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
                  {metadata.ages?.map((age: any) => (
                    <button
                      key={age.id}
                      onClick={() => onInputChange({ target: { name: 'ageGroup', value: age.name } })}
                      className={`p-2 rounded text-sm font-medium border ${
                        formData.ageGroup === age.name
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {age.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pages & Service Type & Financial Summary Row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Pages */}
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Page Count</label>
                  <div className="space-y-1">
                    {metadata.pages?.map((pg: any) => (
                      <button
                        key={pg.id}
                        onClick={() => onInputChange({ target: { name: 'pages', value: pg.option_label } })}
                        className={`w-full p-2 rounded text-xs font-medium border ${
                          formData.pages === pg.option_label
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {pg.option_label} Pages
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
                    className="w-full p-2 border rounded text-xs bg-white"
                  >
                    <option value="">Select...</option>
                    {metadata.services?.map((t: any) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Financial Summary */}
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Agency Price</label>
                  {pricing.price > 0 ? (
                    <div className="group relative bg-gradient-to-r from-slate-900 to-slate-800 p-3 rounded-lg border border-slate-900 cursor-help">
                      <div className="text-2xl font-bold text-white">£{pricing.price.toFixed(2)}</div>
                      {/* Hidden cost shows on hover */}
                      <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900 text-white p-2 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Our Cost: £{pricing.cost.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      Select Options
                    </div>
                  )}
                </div>
              </div>
            </div>
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
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Application'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
