'use client'

import { useState } from 'react'
import { ModalWrapper } from './ModalWrapper'
import { toast } from 'sonner'

interface Transaction {
  id: string
  amount: number
  remark?: string
  transaction_type?: string
  loan_id?: string
}

interface ModifyInstallmentPlanModalProps {
  transaction: Transaction
  onClose: () => void
  onRefresh: () => void
}

export function ModifyInstallmentPlanModal({
  transaction,
  onClose,
  onRefresh,
}: ModifyInstallmentPlanModalProps) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm('Delete this service charge and all related installments? This will remove the entire transaction from the account.')) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/lms/delete-installment-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete')
      }

      toast.success('Service charge deleted and balance updated')
      onClose()
      onRefresh()
    } catch (err: any) {
      console.error('Delete error:', err)
      toast.error(err.message || 'Failed to delete')
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title="Modify Installment Plan">
      <div className="space-y-4">
        {/* Transaction Details */}
        <div className="bg-slate-50 p-4 rounded-lg">
          <h3 className="font-semibold text-slate-800 mb-2">Transaction Details</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Service Amount:</span>
              <span className="font-semibold">£{parseFloat(transaction.amount as any).toFixed(2)}</span>
            </div>
            {transaction.remark && (
              <div className="flex justify-between">
                <span className="text-slate-600">Notes:</span>
                <span className="text-slate-700">{transaction.remark}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">Reference:</span>
              <span className="font-mono text-xs text-slate-500">{transaction.id.substring(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Modify Options */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">Modification Options</h3>
          
          {/* Future: Add modify installment schedule option */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p className="font-medium mb-1">💡 Modify Schedule (Coming Soon)</p>
            <p className="text-xs text-blue-600">
              Future updates will allow you to edit payment schedules, adjust amounts, and change frequencies.
            </p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="border-t pt-4">
          <h3 className="font-semibold text-red-700 mb-2">Danger Zone</h3>
          <p className="text-sm text-slate-600 mb-3">
            Permanently delete this service charge and all associated installment records. This action cannot be undone.
          </p>
          
          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Deleting...' : 'Delete Service Transaction'}
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </ModalWrapper>
  )
}
