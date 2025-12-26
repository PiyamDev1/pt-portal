interface EditModalProps {
  isOpen: boolean
  editType: 'application' | 'family_head' | null
  editFormData: any
  deleteAuthCode: string
  onInputChange: (name: string, value: string) => void
  onAuthCodeChange: (code: string) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export default function EditModal({
  isOpen,
  editType,
  editFormData,
  deleteAuthCode,
  onInputChange,
  onAuthCodeChange,
  onSave,
  onDelete,
  onClose
}: EditModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">
            {editType === 'family_head' ? 'Modify Family Head' : 'Modify Application'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          {/* SECTION 1: PERSONAL DETAILS */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <span>👤 Personal Details</span>
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">First Name</label>
                <input
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={editFormData.firstName || ''}
                  onChange={(e) => onInputChange('firstName', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Last Name</label>
                <input
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={editFormData.lastName || ''}
                  onChange={(e) => onInputChange('lastName', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase text-slate-400 flex justify-between">
                  <span>CNIC (Read Only)</span>
                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">🔒 Locked</span>
                </label>
                <input
                  className="w-full border rounded p-2 text-sm font-mono bg-slate-100 text-slate-500 cursor-not-allowed"
                  value={editFormData.cnic || ''}
                  readOnly
                  title="CNIC cannot be edited to prevent database corruption"
                />
              </div>
              {editType === 'application' && (
                <div className="col-span-2">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Email Address</label>
                  <input
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editFormData.email || ''}
                    onChange={(e) => onInputChange('email', e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: SERVICE DETAILS (Only for Application) */}
          {editType === 'application' && (
            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
              <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                <span>⚡ Service & Tracking</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Service Option</label>
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editFormData.serviceOption || 'Normal'}
                    onChange={(e) => onInputChange('serviceOption', e.target.value)}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Executive">Executive</option>
                    <option value="Upgrade to Fast">Upgrade to Fast</option>
                    <option value="Modification">Modification</option>
                    <option value="Reprint">Reprint</option>
                    <option value="Cancellation">Cancellation</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">Tracking ID</label>
                  <input
                    className="w-full border rounded p-2 text-sm font-mono bg-white"
                    value={editFormData.trackingNumber || ''}
                    onChange={(e) => onInputChange('trackingNumber', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">PIN</label>
                  <input
                    className="w-full border rounded p-2 text-sm font-mono bg-white"
                    value={editFormData.pin || ''}
                    onChange={(e) => onInputChange('pin', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="pt-4 border-t border-slate-100 space-y-6">
            <button
              onClick={onSave}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-sm"
            >
              Save Changes
            </button>

            {/* DANGER ZONE */}
            <div className="bg-red-50 p-4 rounded-lg space-y-3 border border-red-100">
              <div className="flex items-center gap-2 text-red-700">
                <span className="text-sm">⚠️</span>
                <h4 className="text-xs font-bold uppercase">Danger Zone</h4>
              </div>
              <p className="text-xs text-red-600 leading-relaxed">
                Deleting this record is permanent. Please enter your Auth Code to confirm.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Auth Code"
                  className="flex-1 border border-red-200 rounded p-2 text-sm focus:ring-red-500 bg-white"
                  value={deleteAuthCode}
                  onChange={(e) => onAuthCodeChange(e.target.value)}
                />
                <button
                  onClick={onDelete}
                  className="bg-white border border-red-200 text-red-600 font-bold px-4 py-2 rounded hover:bg-red-600 hover:text-white transition whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
