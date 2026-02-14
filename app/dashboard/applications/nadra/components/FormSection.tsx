interface FormData {
  familyHeadName: string
  familyHeadCnic: string
  familyHeadPhone: string
  applicantName: string
  applicantCnic: string
  applicantEmail: string
  serviceType: string
  serviceOption: string
  trackingNumber: string
  pin: string
  newBorn: boolean
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
  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-700 uppercase text-xs tracking-widest">Application Ledger</h3>
        <button
          onClick={onToggle}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition flex items-center gap-2 text-sm"
        >
          {showForm ? 'Close Form' : '+ New Family Entry'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow-md animate-fade-in-down space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Hierarchy & Applicant */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">1. Hierarchy</h4>
              <div className="space-y-2">
                <input
                  name="familyHeadName"
                  value={formData.familyHeadName}
                  onChange={onInputChange}
                  placeholder="Family Head Name"
                  className="w-full p-2 border rounded text-sm"
                />
                <input
                  name="familyHeadCnic"
                  value={formData.familyHeadCnic}
                  onChange={onInputChange}
                  placeholder="Family Head CNIC (Auto-formatted)"
                  className="w-full p-2 border rounded text-sm font-mono"
                />
                <input
                  name="familyHeadPhone"
                  value={formData.familyHeadPhone}
                  onChange={onInputChange}
                  placeholder="Family Head Phone"
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div className="pt-2 space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. Applicant</h4>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    name="newBorn"
                    checked={formData.newBorn}
                    onChange={onInputChange}
                    className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
                  />
                  <span className="font-semibold">New Born / First Application</span>
                </label>
                <input
                  name="applicantName"
                  value={formData.applicantName}
                  onChange={onInputChange}
                  placeholder="Applicant Name"
                  className="w-full p-2 border rounded text-sm"
                />
                <input
                  name="applicantCnic"
                  value={formData.applicantCnic}
                  onChange={onInputChange}
                  placeholder="Applicant CNIC (Auto-formatted)"
                  className={`w-full p-2 border rounded text-sm font-mono ${formData.newBorn ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                  required={!formData.newBorn}
                  disabled={formData.newBorn}
                />
                <input
                  name="applicantEmail"
                  value={formData.applicantEmail}
                  onChange={onInputChange}
                  placeholder="Applicant Email"
                  type="email"
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>

            {/* Right Column: Service & Credentials */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Service & Urgency</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Service Type</label>
                  <select
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={onInputChange}
                    className="w-full p-2 border rounded text-sm bg-white"
                  >
                    <option value="NICOP/CNIC">NICOP / CNIC</option>
                    <option value="POC">POC</option>
                    <option value="FRC">FRC</option>
                    <option value="CRC">CRC</option>
                    <option value="POA">POA</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Service Option</label>
                  <select
                    name="serviceOption"
                    value={formData.serviceOption}
                    onChange={onInputChange}
                    className="w-full p-2 border rounded text-sm bg-white font-medium"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Executive">Executive</option>
                    <option value="Upgrade to Fast">Upgrade to Fast</option>
                    <option value="Modification">Modification</option>
                    <option value="Reprint">Reprint</option>
                    <option value="Cancellation">Cancellation</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">4. Access Credentials</h4>
                <div className="flex gap-2">
                  <input
                    name="trackingNumber"
                    value={formData.trackingNumber}
                    onChange={onInputChange}
                    placeholder="Tracking ID"
                    className="w-2/3 p-2 border rounded text-sm font-mono"
                    required
                  />
                  <input
                    name="pin"
                    value={formData.pin}
                    onChange={onInputChange}
                    placeholder="PIN"
                    className="w-1/3 p-2 border rounded text-sm font-bold text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Application to Ledger'}
          </button>
        </div>
      )}
    </>
  )
}
