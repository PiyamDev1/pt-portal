'use client'
import { useEffect, useRef } from 'react'

interface NotesModalProps {
  isOpen: boolean
  note: string
  isSaving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onClose: () => void
}

export default function NotesModal({
  isOpen,
  note,
  isSaving,
  onChange,
  onSave,
  onClose
}: NotesModalProps) {
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
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Application notes"
        tabIndex={-1}
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">Application Notes</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button" aria-label="Close notes">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label htmlFor="nadra-notes" className="text-xs font-bold uppercase text-slate-400">
            Internal Notes (Visible to agents only)
          </label>
          <textarea
            id="nadra-notes"
            rows={6}
            value={note}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Add internal notes about this application..."
            className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isSaving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
