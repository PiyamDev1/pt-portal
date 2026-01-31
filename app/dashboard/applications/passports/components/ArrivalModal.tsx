import React, { useEffect, useRef } from 'react'

export default function ArrivalModal({ open, onClose, newPassportNum, setNewPassportNum, onSave }: any) {
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
      <div ref={dialogRef} className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm" role="dialog" aria-modal="true" aria-label="New passport arrived" tabIndex={-1}>
        <h3 className="font-bold text-lg text-slate-800 mb-2">New Passport Arrived</h3>
        <label htmlFor="arrival-passport" className="sr-only">New passport number</label>
        <input
          id="arrival-passport"
          className="w-full p-3 border rounded-lg font-mono text-lg mb-4 uppercase"
          placeholder="New Passport #"
          autoFocus
          value={newPassportNum}
          onChange={(e) => setNewPassportNum(e.target.value.toUpperCase())}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-slate-500 font-bold" type="button">Cancel</button>
          <button onClick={onSave} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded" type="button" aria-label="Save passport number">Save</button>
        </div>
      </div>
    </div>
  )
}
