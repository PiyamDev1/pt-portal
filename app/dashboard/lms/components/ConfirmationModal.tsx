'use client'

import { useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel
}: ConfirmationModalProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {isDangerous && (
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          )}
          <div className="flex-grow">
            <h2 className={`text-lg font-bold ${isDangerous ? 'text-red-700' : 'text-slate-800'}`}>
              {title}
            </h2>
          </div>
        </div>

        {/* Message */}
        <p className="text-slate-600 text-sm mb-6 whitespace-pre-wrap">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white'
            }`}
          >
            <Check className="w-4 h-4" />
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
