import React, { useEffect, useRef } from 'react'

export default function EditModal({
  open,
  onClose,
  editFormData,
  setEditFormData,
  deleteAuthCode,
  setDeleteAuthCode,
  onSubmit,
  onDelete
}: any) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
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
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit passport application" className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" tabIndex={-1}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">Edit Application</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="edit-applicant-name" className="text-[10px] uppercase font-bold text-slate-400">Applicant Name</label>
              <input id="edit-applicant-name" className="w-full p-2 border rounded text-sm" value={editFormData.applicantName || ''} onChange={(e) => setEditFormData({ ...editFormData, applicantName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="edit-cnic" className="text-[10px] uppercase font-bold text-slate-400">CNIC</label>
              <input id="edit-cnic" className="w-full p-2 border rounded text-sm font-mono bg-gray-100 text-gray-500 cursor-not-allowed" value={editFormData.applicantCnic || ''} disabled={true} title="Citizen Number cannot be changed" />
            </div>
            <div>
              <label htmlFor="edit-email" className="text-[10px] uppercase font-bold text-slate-400">Applicant Email</label>
              <input id="edit-email" className="w-full p-2 border rounded text-sm" value={editFormData.applicantEmail || ''} onChange={(e) => setEditFormData({ ...editFormData, applicantEmail: e.target.value })} />
            </div>
            <div>
              <label htmlFor="edit-phone" className="text-[10px] uppercase font-bold text-slate-400">Phone Number</label>
              <input id="edit-phone" className="w-full p-2 border rounded text-sm" value={editFormData.applicantPhone || ''} onChange={(e) => setEditFormData({ ...editFormData, applicantPhone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="edit-tracking" className="text-[10px] uppercase font-bold text-slate-400">Tracking #</label>
              <input id="edit-tracking" className="w-full p-2 border rounded text-sm font-mono" value={editFormData.trackingNumber || ''} onChange={(e) => setEditFormData({ ...editFormData, trackingNumber: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label htmlFor="edit-old-passport" className="text-[10px] uppercase font-bold text-slate-400">Old Passport #</label>
              <input id="edit-old-passport" className="w-full p-2 border rounded text-sm font-mono" value={editFormData.oldPassportNumber || ''} onChange={(e) => setEditFormData({ ...editFormData, oldPassportNumber: e.target.value.toUpperCase() })} />
            </div>
            <div className="col-span-2">
              <label htmlFor="edit-family-email" className="text-[10px] uppercase font-bold text-slate-400">Family Head Email</label>
              <input id="edit-family-email" className="w-full p-2 border rounded text-sm" value={editFormData.familyHeadEmail || ''} onChange={(e) => setEditFormData({ ...editFormData, familyHeadEmail: e.target.value })} />
            </div>
            <div>
              <label htmlFor="edit-speed" className="text-[10px] uppercase font-bold text-slate-400">Speed</label>
              <select id="edit-speed" className="w-full p-2 border rounded text-sm" value={editFormData.speed || 'Normal'} onChange={(e) => setEditFormData({ ...editFormData, speed: e.target.value })}>
                <option>Normal</option>
                <option>Executive</option>
              </select>
            </div>
          </div>

          <button type="button" onClick={onSubmit} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">
            Update Record
          </button>

          <div className="border-t border-red-100 pt-6 mt-6">
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Danger Zone</h4>
              <p className="text-xs text-red-600 mb-3">Enter auth code to permanently delete this record.</p>
              <div className="flex gap-2">
                <label htmlFor="delete-auth-code" className="sr-only">Authorization code</label>
                <input
                  id="delete-auth-code"
                  type="password"
                  placeholder="Auth Code"
                  className="flex-1 p-2 border border-red-200 rounded text-sm bg-white"
                  value={deleteAuthCode}
                  onChange={(e) => setDeleteAuthCode(e.target.value)}
                />
                <button type="button" onClick={onDelete} className="bg-white text-red-600 border border-red-200 px-4 py-2 rounded font-bold hover:bg-red-600 hover:text-white transition">
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
