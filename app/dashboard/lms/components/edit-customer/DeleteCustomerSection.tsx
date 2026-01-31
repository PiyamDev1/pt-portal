'use client'

import { AlertTriangle, Trash2 } from 'lucide-react'
import { LoadingSpinner } from '../Skeletons'

interface DeleteCustomerSectionProps {
  deleteAuthCode: string
  onAuthCodeChange: (code: string) => void
  onDelete: () => void
  deleting: boolean
}

export function DeleteCustomerSection({
  deleteAuthCode,
  onAuthCodeChange,
  onDelete,
  deleting
}: DeleteCustomerSectionProps) {
  return (
    <div className="mt-4 p-3 border border-red-200 rounded-lg bg-red-50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-bold text-red-800">Delete Customer</div>
          <p className="text-xs text-red-700">
            Enter your Google Authenticator code to permanently delete this customer and all
            related records.
          </p>
          <input
            type="text"
            value={deleteAuthCode}
            onChange={e => onAuthCodeChange(e.target.value)}
            placeholder="Auth Code"
            className="w-full p-2 border border-red-200 rounded-lg focus:border-red-500"
          />
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? <LoadingSpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Deleting...' : 'Delete Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}
