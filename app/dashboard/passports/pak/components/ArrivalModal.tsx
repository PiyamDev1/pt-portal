import React from 'react'

export default function ArrivalModal({ open, onClose, newPassportNum, setNewPassportNum, onSave }: any) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
        <h3 className="font-bold text-lg text-slate-800 mb-2">New Passport Arrived</h3>
        <input
          className="w-full p-3 border rounded-lg font-mono text-lg mb-4 uppercase"
          placeholder="New Passport #"
          autoFocus
          value={newPassportNum}
          onChange={(e) => setNewPassportNum(e.target.value.toUpperCase())}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button>
          <button onClick={onSave} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded">Save</button>
        </div>
      </div>
    </div>
  )
}
