/**
 * Module: app/dashboard/applications/passports/components/NotesModal.tsx
 * Dashboard module for applications/passports/components/NotesModal.tsx.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'

type NotesModalProps = {
  open: boolean
  onClose: () => void
  trackingNumber?: string
  notes: string
  setNotes: (value: string) => void
  onSave: () => void
  onMarkUnread?: () => void
  canMarkUnread?: boolean
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
  onMarkUnread,
  canMarkUnread = false,
  isSaving,
  isLoading,
}: NotesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [originalNotes, setOriginalNotes] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const hasUnsavedChanges = useMemo(() => !isLoading && notes !== originalNotes, [
    isLoading,
    notes,
    originalNotes,
  ])

  // Track original notes when modal opens
  useEffect(() => {
    if (open && !isLoading) {
      Promise.resolve().then(() => {
        setOriginalNotes(notes)
      })
    }
  }, [open, isLoading, notes])

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }, [hasUnsavedChanges, onClose])

  const handleSave = useCallback(async () => {
    await onSave()
    setOriginalNotes(notes)
  }, [notes, onSave])

  // Keyboard shortcut: Ctrl/Cmd + S to save
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        if (!isSaving && !isLoading && hasUnsavedChanges) {
          handleSave()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, isSaving, isLoading, hasUnsavedChanges, handleClose, handleSave])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Application notes for ${trackingNumber || 'record'}`}
          className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl"
          tabIndex={-1}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-bold text-xl text-slate-800 mb-1">Application Notes</h3>
              <p className="text-sm text-slate-500">
                Tracking:{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {trackingNumber || 'N/A'}
                </span>
              </p>
            </div>
            {hasUnsavedChanges && !isSaving && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
                Unsaved changes
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3 animate-pulse" role="status" aria-live="polite">
              <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              <div className="h-32 bg-slate-200 rounded"></div>
              <div className="h-4 bg-slate-200 rounded w-1/6"></div>
            </div>
          ) : (
            <>
              <label
                htmlFor="passport-app-notes"
                className="block text-xs uppercase font-bold text-slate-500 mb-2"
              >
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

          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {!isLoading && (
                <span>
                  💡 Tip: Press{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono">
                    Ctrl+S
                  </kbd>{' '}
                  to save
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onMarkUnread}
                type="button"
                disabled={isSaving || isLoading || !canMarkUnread}
                className="px-3 py-2 text-xs rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Mark as unread
              </button>
              <button
                onClick={handleClose}
                type="button"
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 font-semibold hover:text-slate-800"
              >
                Close
              </button>
              <button
                onClick={handleSave}
                type="button"
                disabled={isSaving || isLoading || !hasUnsavedChanges}
                className={`px-4 py-2 rounded-md font-semibold text-white ${
                  isSaving || isLoading || !hasUnsavedChanges
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ConfirmationDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false)
          onClose()
        }}
        title="Discard Changes?"
        message="You have unsaved notes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        type="warning"
      />
    </>
  )
}
