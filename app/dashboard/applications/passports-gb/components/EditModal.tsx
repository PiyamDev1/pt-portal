'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'

interface EditModalProps {
  isOpen: boolean
  editFormData: any
  setEditFormData: (data: any) => void
  onSave: () => void
  onClose: () => void
  isSaving: boolean
  onDelete?: (authCode: string) => void
}

export default function EditModal({
  isOpen,
  editFormData,
  setEditFormData,
  onSave,
  onClose,
  isSaving,
  onDelete
}: EditModalProps) {
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">Edit Application</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Applicant Name & Phone */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Full Name
            </label>
            <input
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm"
              value={editFormData.applicantName || ''}
              onChange={(e) =>
                setEditFormData({ ...editFormData, applicantName: e.target.value })
              }
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Phone Number
            </label>
            <input
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm"
              value={editFormData.phoneNumber || ''}
              onChange={(e) =>
                setEditFormData({ ...editFormData, phoneNumber: e.target.value })
              }
              placeholder="Phone number"
              type="tel"
            />
          </div>

          {/* Passport Number */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Passport Number
            </label>
            <input
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono uppercase"
              value={editFormData.applicantPassport || ''}
              onChange={(e) =>
                setEditFormData({
                  ...editFormData,
                  applicantPassport: e.target.value.toUpperCase()
                })
              }
              placeholder="Passport number (optional)"
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Date of Birth
            </label>
            <input
              type="date"
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm"
              value={editFormData.dateOfBirth || ''}
              onChange={(e) =>
                setEditFormData({ ...editFormData, dateOfBirth: e.target.value })
              }
            />
          </div>

          {/* PEX Reference */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              PEX Reference
            </label>
            <input
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono uppercase"
              value={editFormData.pexNumber || ''}
              onChange={(e) =>
                setEditFormData({
                  ...editFormData,
                  pexNumber: e.target.value.toUpperCase()
                })
              }
              placeholder="PEX Reference"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Status
            </label>
            <select
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white"
              value={editFormData.status || 'Pending Submission'}
              onChange={(e) =>
                setEditFormData({ ...editFormData, status: e.target.value })
              }
            >
              <option value="Pending Submission">Pending Submission</option>
              <option value="Submitted">Submitted</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Delete Section */}
        {onDelete && (
          <div className="p-6 bg-red-50/50 border-t border-red-100 space-y-3">
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
                onChange={(e) => setDeleteAuthCode(e.target.value)}
              />
              <button
                onClick={() => {
                  if (deleteAuthCode.trim()) {
                    onDelete?.(deleteAuthCode)
                    setDeleteAuthCode('')
                  }
                }}
                className="bg-white border border-red-200 text-red-600 font-bold px-4 py-2 rounded hover:bg-red-600 hover:text-white transition whitespace-nowrap"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm rounded-lg hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Update Record'}
          </button>
        </div>
      </div>
    </div>
  )
}
