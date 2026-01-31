import React, { useEffect, useRef } from 'react'

export default function HistoryModal({ open, onClose, trackingNumber, statusHistory }: any) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Status timeline for ${trackingNumber}`} className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" tabIndex={-1}>
        <h3 className="font-bold text-xl text-slate-800 mb-1">Status Timeline</h3>
        <p className="text-sm text-slate-500 mb-6">Tracking: <span className="font-mono font-bold text-slate-700">{trackingNumber}</span></p>

        {statusHistory?.length === 0 ? (
          <p className="text-center text-slate-400 py-8" role="status" aria-live="polite">No status updates recorded yet.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-slate-200"></div>

            <div className="space-y-6">
              {statusHistory.map((entry: any, idx: number) => (
                <div key={entry.id || idx} className="relative pl-16">
                  <div className={`absolute left-4 top-1 w-5 h-5 rounded-full border-4 border-white shadow-md ${idx === 0 ? 'bg-green-500' : 'bg-blue-400'}`}></div>

                  <div className="bg-slate-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-lg text-slate-800">{entry.status}</div>
                        {entry.description && (
                          <div className="text-sm text-slate-600 mt-1">{entry.description}</div>
                        )}
                      </div>
                      {idx === 0 && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">Current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {entry.changed_by && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-slate-700">👤 {entry.changed_by}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <span>🕒</span>
                        <span>{entry.date ? new Date(entry.date).toLocaleString() : 'Unknown time'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="w-full mt-6 py-3 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition" type="button" aria-label="Close status timeline">Close</button>
      </div>
    </div>
  )
}
