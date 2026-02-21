import { useEffect, useRef } from 'react'

interface EditModalProps {
  isOpen: boolean
  editType: 'application' | 'family_head' | null
  editFormData: any
  deleteAuthCode: string
  agentOptions: { id: string; name: string }[]
  canChangeAgent: boolean
  onInputChange: (name: string, value: any) => void
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
  agentOptions,
  canChangeAgent,
  onInputChange,
  onAuthCodeChange,
  onSave,
  onDelete,
  onClose
}: EditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div ref={dialogRef} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" role="dialog" aria-modal="true" aria-label={editType === 'family_head' ? 'Modify family head' : 'Modify application'} tabIndex={-1}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">
            {editType === 'family_head' ? 'Modify Family Head' : 'Modify Application'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button" aria-label="Close edit dialog">
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
                <label htmlFor="edit-firstName" className="text-[10px] font-bold uppercase text-slate-400">First Name</label>
                <input
                  id="edit-firstName"
                  name="firstName"
                  type="text"
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={editFormData.firstName || ''}
                  onChange={(e) => onInputChange('firstName', e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="edit-lastName" className="text-[10px] font-bold uppercase text-slate-400">Last Name</label>
                <input
                  id="edit-lastName"
                  name="lastName"
                  type="text"
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={editFormData.lastName || ''}
                  onChange={(e) => onInputChange('lastName', e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
                  checked={!!editFormData.newBorn}
                  onChange={(e) => onInputChange('newBorn', e.target.checked)}
                />
                <span className="font-semibold">New Born / First Application</span>
              </label>
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase text-slate-400 flex justify-between">
                  <span>CNIC (Read Only)</span>
                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">🔒 Locked</span>
                </label>
                <input
                  className={`w-full border rounded p-2 text-sm font-mono ${editFormData.newBorn ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                  value={editFormData.cnic || ''}
                  readOnly={!editFormData.newBorn}
                  disabled={editFormData.newBorn}
                  title={editFormData.newBorn ? 'Citizen number disabled for newborn flow' : 'CNIC cannot be edited to prevent database corruption'}
                />
              </div>
              {editType === 'family_head' && (
                <div className="col-span-2">
                  <label htmlFor="edit-phone" className="text-[10px] font-bold uppercase text-slate-400">Phone Number</label>
                  <input
                    id="edit-phone"
                    name="phone"
                    type="tel"
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editFormData.phone || ''}
                    onChange={(e) => onInputChange('phone', e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              )}
              {editType === 'application' && (
                <div className="col-span-2">
                  <label htmlFor="edit-email" className="text-[10px] font-bold uppercase text-slate-400">Email Address</label>
                  <input
                    id="edit-email"
                    name="email"
                    type="email"
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editFormData.email || ''}
                    onChange={(e) => onInputChange('email', e.target.value)}
                    autoComplete="email"
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
                  <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center justify-between">
                    <span>Assigned Agent</span>
                    {!canChangeAgent && (
                      <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">Manager only</span>
                    )}
                  </label>
                  {canChangeAgent ? (
                    <select
                      className="w-full border rounded p-2 text-sm bg-white"
                      value={editFormData.employeeId || ''}
                      onChange={(e) => onInputChange('employeeId', e.target.value)}
                    >
                      <option value="">Select an agent</option>
                      {agentOptions.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="w-full border rounded p-2 text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
                      value={editFormData.employeeName || 'Not assigned'}
                      readOnly
                      disabled
                      title="Only managers or master admins can change assigned agents"
                    />
                  )}
                </div>
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
                  <label htmlFor="edit-trackingNumber" className="text-[10px] font-bold uppercase text-slate-400">Tracking ID</label>
                  <input
                    id="edit-trackingNumber"
                    name="trackingNumber"
                    type="text"
                    className="w-full border rounded p-2 text-sm font-mono bg-white"
                    value={editFormData.trackingNumber || ''}
                    onChange={(e) => onInputChange('trackingNumber', e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="edit-pin" className="text-[10px] font-bold uppercase text-slate-400">PIN</label>
                  <input
                    id="edit-pin"
                    name="pin"
                    type="text"
                    className="w-full border rounded p-2 text-sm font-mono bg-white"
                    value={editFormData.pin || ''}
                    onChange={(e) => onInputChange('pin', e.target.value)}
                    autoComplete="off"
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
              type="button"
              aria-label="Save changes"
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
                <label htmlFor="nadra-delete-auth" className="sr-only">Auth code</label>
                <input
                  id="nadra-delete-auth"
                  type="password"
                  placeholder="Auth Code"
                  className="flex-1 border border-red-200 rounded p-2 text-sm focus:ring-red-500 bg-white"
                  value={deleteAuthCode}
                  onChange={(e) => onAuthCodeChange(e.target.value)}
                />
                <button
                  onClick={onDelete}
                  className="bg-white border border-red-200 text-red-600 font-bold px-4 py-2 rounded hover:bg-red-600 hover:text-white transition whitespace-nowrap"
                  type="button"
                  aria-label="Delete record"
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
