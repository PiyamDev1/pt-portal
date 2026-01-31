'use client'

import { ConfirmationModal } from '../ConfirmationModal'

interface DeleteSectionProps {
  transaction: { amount: number }
  loading: boolean
  showDeleteConfirm: boolean
  onDeleteClick: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

export function DeleteSection({
  transaction,
  loading,
  showDeleteConfirm,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete
}: DeleteSectionProps) {
  return (
    <>
      <div className="border-t pt-4">
        <h3 className="font-semibold text-red-700 mb-2">Danger Zone</h3>
        <p className="text-sm text-slate-600 mb-3">
          Permanently delete this service charge and all associated installment records. This action cannot be undone.
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
        message={`Delete this service charge (£${parseFloat(transaction.amount as any).toFixed(2)}) and all related installments?\n\nThis will remove the entire transaction from the account and cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
