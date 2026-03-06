import React, { useEffect, useRef } from 'react'

type NotesModalProps = {
  open: boolean
  onClose: () => void
  trackingNumber?: string
  notes: string
  setNotes: (value: string) => void
  onSave: () => void
  isSaving: boolean
  isLoading: boolean
}

export default function NotesModal({
  open,
  onClose,
  trackingNumber,
  notes,
  setNotes,
  onSave,
  isSaving,
  isLoading
}: NotesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Application notes for ${trackingNumber || 'record'}`}
        className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl"
        tabIndex={-1}
      >
        <h3 className="font-bold text-xl text-slate-800 mb-1">Application Notes</h3>
        <p className="text-sm text-slate-500 mb-4">
          Tracking: <span className="font-mono font-semibold text-slate-700">{trackingNumber || 'N/A'}</span>
        </p>

        {isLoading ? (
          <div className="py-10 text-center text-slate-500 text-sm" role="status" aria-live="polite">
            Loading notes...
          </div>
        ) : (
          <>
            <label htmlFor="passport-app-notes" className="block text-xs uppercase font-bold text-slate-500 mb-2">
              Notes (saved per application)
            </label>
            <textarea
              id="passport-app-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any updates, remarks, follow-ups, or operational notes for this specific application..."
              className="w-full min-h-[180px] resize-y p-3 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
              maxLength={4000}
            />
            <div className="mt-2 text-xs text-slate-500 text-right">{notes.length}/4000</div>
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            type="button"
            disabled={isSaving}
            className="px-4 py-2 text-slate-600 font-semibold hover:text-slate-800"
          >
            Close
          </button>
          <button
            onClick={onSave}
            type="button"
            disabled={isSaving || isLoading}
            className={`px-4 py-2 rounded-md font-semibold text-white ${isSaving || isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700'}`}
          >
            {isSaving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
