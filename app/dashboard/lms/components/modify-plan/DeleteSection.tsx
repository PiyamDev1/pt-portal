/**
 * Module: app/dashboard/lms/components/modify-plan/DeleteSection.tsx
 * Dashboard module for lms/components/modify-plan/DeleteSection.tsx.
 */

'use client'

import { useState } from 'react'
import { ConfirmationModal } from '../ConfirmationModal'

interface DeleteSectionProps {
  transaction: { amount: number }
  loading: boolean
  showDeleteConfirm: boolean
  onDeleteClick: () => void
  onConfirmDelete: (verificationCode: string) => void | Promise<void>
  onCancelDelete: () => void
}

export function DeleteSection({
  transaction,
  loading,
  showDeleteConfirm,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
}: DeleteSectionProps) {
  const [verificationCode, setVerificationCode] = useState('')

  const handleCancel = () => {
    setVerificationCode('')
    onCancelDelete()
  }

  return (
    <>
      <div className="border-t pt-4">
        <h3 className="font-semibold text-red-700 mb-2">Danger Zone</h3>
        <p className="text-sm text-slate-600 mb-3">
          Permanently delete this service charge and all associated installment records. This action
          cannot be undone.
        </p>

        <button
          onClick={onDeleteClick}
          disabled={loading}
          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Deleting...' : 'Delete Service Transaction'}
        </button>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Service Transaction"
        message={`Delete this service charge (£${Number(transaction.amount).toFixed(2)}) and all related installments?\n\nThis will remove the entire transaction from the account and cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        confirmDisabled={!verificationCode.trim()}
        onConfirm={() => onConfirmDelete(verificationCode)}
        onCancel={handleCancel}
      >
        <label htmlFor="delete-plan-verification-code" className="block mb-6">
          <span className="block text-sm font-medium text-slate-700 mb-2">
            Authenticator or backup code
          </span>
          <input
            id="delete-plan-verification-code"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            placeholder="Enter verification code"
          />
        </label>
      </ConfirmationModal>
    </>
  )
}
