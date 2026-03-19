type NadraComplaintModalProps = {
  isOpen: boolean
  trackingNumber: string
  complaintNumber: string
  complaintDetails: string
  complaintSaving: boolean
  onComplaintNumberChange: (value: string) => void
  onComplaintDetailsChange: (value: string) => void
  onSave: () => void
  onClose: () => void
}

export default function NadraComplaintModal({
  isOpen,
  trackingNumber,
  complaintNumber,
  complaintDetails,
  complaintSaving,
  onComplaintNumberChange,
  onComplaintDetailsChange,
  onSave,
  onClose,
}: NadraComplaintModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Launch complaint"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800">Launch Complaint</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">Tracking: {trackingNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition text-slate-400"
            type="button"
            aria-label="Close complaint modal"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label
              htmlFor="nadra-complaint-number"
              className="block text-xs font-bold uppercase text-slate-400 mb-2"
            >
              Complaint Number
            </label>
            <input
              id="nadra-complaint-number"
              value={complaintNumber}
              onChange={(event) => onComplaintNumberChange(event.target.value.toUpperCase())}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono text-slate-800"
              placeholder="Enter complaint reference"
            />
          </div>

          <div>
            <label
              htmlFor="nadra-complaint-details"
              className="block text-xs font-bold uppercase text-slate-400 mb-2"
            >
              Complaint Details
            </label>
            <textarea
              id="nadra-complaint-details"
              value={complaintDetails}
              onChange={(event) => onComplaintDetailsChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 min-h-[140px]"
              placeholder="Describe the complaint raised for this application"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={complaintSaving}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:bg-slate-400"
          >
            {complaintSaving ? 'Saving...' : 'Record Complaint'}
          </button>
        </div>
      </div>
    </div>
  )
}
