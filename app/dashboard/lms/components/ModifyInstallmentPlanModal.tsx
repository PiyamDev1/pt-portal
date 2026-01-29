'use client'

import { useState, useEffect } from 'react'
import { ModalWrapper } from './ModalWrapper'
import { ConfirmationModal } from './ConfirmationModal'
import { toast } from 'sonner'

interface Transaction {
  id: string
  amount: number
  remark?: string
  transaction_type?: string
  loan_id?: string
}

interface Installment {
  id: string
  installment_number: number
  due_date: string
  amount: number
  status: string
  amount_paid: number
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
  const [installments, setInstallments] = useState<Installment[]>([])
  const [editedInstallments, setEditedInstallments] = useState<Installment[]>([])
  const [showSchedule, setShowSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    fetchInstallments()
  }, [transaction.id])

  const fetchInstallments = async () => {
    try {
      const res = await fetch(`/api/lms/installments?transactionId=${transaction.id}`)
      if (res.ok) {
        const data = await res.json()
        const inst = data.installments || []
        setInstallments(inst)
        setEditedInstallments(JSON.parse(JSON.stringify(inst))) // Deep copy
      }
    } catch (err) {
      console.error('Failed to fetch installments:', err)
    }
  }

  const handleInstallmentChange = (index: number, field: 'due_date' | 'amount', value: string) => {
    const updated = [...editedInstallments]
    if (field === 'due_date') {
      updated[index].due_date = value
    } else if (field === 'amount') {
      updated[index].amount = parseFloat(value) || 0
    }
    setEditedInstallments(updated)
  }

  const handleSaveSchedule = async () => {
    // Validate changes
    const hasChanges = editedInstallments.some((edited, idx) => {
      const original = installments[idx]
      return edited.due_date !== original.due_date || edited.amount !== original.amount
    })

    if (!hasChanges) {
      toast.info('No changes to save')
      return
    }

    // Validate amounts
    const totalAmount = editedInstallments.reduce((sum, inst) => sum + inst.amount, 0)
    const serviceAmount = parseFloat(transaction.amount as any)
    
    if (Math.abs(totalAmount - serviceAmount) > 0.01) {
      toast.error(`Total installments (£${totalAmount.toFixed(2)}) must equal service amount (£${serviceAmount.toFixed(2)})`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/lms/update-installments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installments: editedInstallments })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update')
      }

      toast.success(`Updated ${data.updated.length} installment(s)`)
      await fetchInstallments()
      onRefresh()
      setShowSchedule(false)
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedInstallments(JSON.parse(JSON.stringify(installments)))
    setShowSchedule(false)
  }

  // Convert YYYY-MM-DD to DD/MM/YYYY for display
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  // Convert DD/MM/YYYY to YYYY-MM-DD for storage
  const formatDateStorage = (dateStr: string) => {
    if (!dateStr) return ''
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    return dateStr
  }

  const handleDelete = async () => {
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

  const totalInstallments = installments.length
  const paidInstallments = installments.filter(i => i.status === 'paid').length
  const canModify = paidInstallments === 0

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
            {totalInstallments > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Installments:</span>
                <span className="text-slate-700">{paidInstallments}/{totalInstallments} paid</span>
              </div>
            )}
          </div>
        </div>

        {/* Modify Schedule Section */}
        {!showSchedule && totalInstallments > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Modification Options</h3>
            
            <button
              onClick={() => setShowSchedule(true)}
              disabled={!canModify}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {canModify ? 'Modify Payment Schedule' : 'Cannot Modify (Payments Made)'}
            </button>

            {!canModify && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠️ Schedule cannot be modified once payments have been made
              </p>
            )}
          </div>
        )}

        {/* Schedule Editor */}
        {showSchedule && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Edit Payment Schedule</h3>
              <button
                onClick={handleCancelEdit}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-3 bg-slate-50">
              {editedInstallments.map((inst, idx) => (
                <div key={inst.id} className="bg-white p-3 rounded border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Installment {inst.installment_number}/{totalInstallments}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      inst.status === 'paid' ? 'bg-green-100 text-green-700' :
                      inst.status === 'skipped' ? 'bg-gray-100 text-gray-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {inst.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Due Date</label>
                      <input
                        type="date"
                        value={inst.due_date}
                        onChange={(e) => handleInstallmentChange(idx, 'due_date', e.target.value)}
                        disabled={inst.status === 'paid' || inst.status === 'skipped'}
                        className="w-full px-2 py-1.5 text-sm border rounded disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Amount (£)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={inst.status === 'paid' ? inst.amount_paid : inst.status === 'skipped' ? 0 : inst.amount}
                        onChange={(e) => handleInstallmentChange(idx, 'amount', e.target.value)}
                        disabled={inst.status === 'paid' || inst.status === 'skipped'}
                        className="w-full px-2 py-1.5 text-sm border rounded disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-blue-700">Total Installments:</span>
                <span className="font-semibold text-blue-900">
                  £{editedInstallments.reduce((sum, inst) => {
                    const displayAmount = inst.status === 'paid' ? inst.amount_paid : inst.status === 'skipped' ? 0 : inst.amount
                    return sum + displayAmount
                  }, 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Service Amount:</span>
                <span className="font-semibold text-blue-900">
                  £{parseFloat(transaction.amount as any).toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSaveSchedule}
              disabled={saving}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Danger Zone */}
        {!showSchedule && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-red-700 mb-2">Danger Zone</h3>
            <p className="text-sm text-slate-600 mb-3">
              Permanently delete this service charge and all associated installment records. This action cannot be undone.
            </p>
            
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Deleting...' : 'Delete Service Transaction'}
            </button>
          </div>
        )}

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Delete Service Transaction"
          message={`Delete this service charge (£${parseFloat(transaction.amount as any).toFixed(2)}) and all related installments?\n\nThis will remove the entire transaction from the account and cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous={true}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        {/* Close Button */}
        {!showSchedule && (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </ModalWrapper>
  )
}
