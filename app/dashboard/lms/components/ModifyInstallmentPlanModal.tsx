'use client'

import { useState } from 'react'
import { ModalWrapper } from './ModalWrapper'
import { useInstallmentManagement } from '../hooks/useInstallmentManagement'
import { TransactionDetails } from './modify-plan/TransactionDetails'
import { ModificationOptions } from './modify-plan/ModificationOptions'
import { ScheduleEditor } from './modify-plan/ScheduleEditor'
import { DeleteSection } from './modify-plan/DeleteSection'

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
  const [showSchedule, setShowSchedule] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const {
    loading,
    editedInstallments,
    saving,
    totalInstallments,
    paidInstallments,
    canModify,
    handleInstallmentChange,
    handleSaveSchedule: hookSaveSchedule,
    handleCancelEdit: hookCancelEdit,
    handleDelete: hookDelete,
    fetchInstallments
  } = useInstallmentManagement(transaction)

  const handleSaveSchedule = async () => {
    const success = await hookSaveSchedule()
    if (success) {
      onRefresh()
      setShowSchedule(false)
    }
  }

  const handleCancelEdit = () => {
    hookCancelEdit()
    setShowSchedule(false)
  }

  const handleDelete = async () => {
    const success = await hookDelete()
    if (success) {
      onClose()
      onRefresh()
    }
  }

  return (
    <ModalWrapper onClose={onClose} title="Modify Installment Plan">
      <div role="dialog" aria-modal="true" aria-label="Modify installment plan" className="space-y-4">
        <TransactionDetails
          transaction={transaction}
          totalInstallments={totalInstallments}
          paidInstallments={paidInstallments}
        />

        {!showSchedule && totalInstallments > 0 && (
          <ModificationOptions
            canModify={canModify}
            onModify={() => setShowSchedule(true)}
          />
        )}

        {showSchedule && (
          <ScheduleEditor
            editedInstallments={editedInstallments}
            onInstallmentChange={handleInstallmentChange}
            onCancel={handleCancelEdit}
            onSave={handleSaveSchedule}
            saving={saving}
            transaction={transaction}
            totalInstallments={totalInstallments}
          />
        )}

        {!showSchedule && (
          <DeleteSection
            transaction={transaction}
            loading={loading}
            showDeleteConfirm={showDeleteConfirm}
            onDeleteClick={() => setShowDeleteConfirm(true)}
            onConfirmDelete={handleDelete}
            onCancelDelete={() => setShowDeleteConfirm(false)}
          />
        )}

        {!showSchedule && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel and close modify installment plan dialog"
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </ModalWrapper>
  )
}
