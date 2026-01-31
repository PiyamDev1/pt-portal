'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { ConfirmationModal } from './ConfirmationModal'
import { InstallmentPaymentModal } from './InstallmentPaymentModal'
import { ModifyInstallmentPlanModal } from './ModifyInstallmentPlanModal'
import { Account } from '../types'
import { useInstallmentsByTransaction } from '../hooks'
import { StatementHeader } from './StatementHeader'
import { StatementFooter } from './StatementFooter'
import { StatementTransactionsTable } from './StatementTransactionsTable'

interface StatementPopupProps {
  account: Account
  employeeId: string
  onClose: () => void
  onAddPayment: (account: Account) => void
  onAddDebt: (account: Account) => void
  onRefresh?: () => void
}

/**
 * Statement Popup - Displays account transaction history and balance
 */
export function StatementPopup({
  account,
  employeeId,
  onClose,
  onAddPayment,
  onAddDebt,
  onRefresh,
}: StatementPopupProps) {
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null)
  const { localAccount, installmentsByTransaction } = useInstallmentsByTransaction(account)
  const [modifyingTransaction, setModifyingTransaction] = useState<any>(null)
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null)
  const [skipInstallmentId, setSkipInstallmentId] = useState<string | null>(null)

  return (
    <ModalWrapper onClose={onClose} title={`Statement - ${account.name}`}>
      <div className="space-y-4">
        <StatementHeader account={account} />

        <StatementTransactionsTable
          localAccount={localAccount}
          installmentsByTransaction={installmentsByTransaction}
          onSelectInstallment={(installment) => setSelectedInstallment(installment)}
          onDeletePayment={(id) => setDeletePaymentId(id)}
          onModifyTransaction={(tx) => setModifyingTransaction(tx)}
          onSkipInstallment={(id) => setSkipInstallmentId(id)}
        />

        <StatementFooter
          account={account}
          onAddPayment={onAddPayment}
          onAddDebt={onAddDebt}
          onClose={onClose}
        />
      </div>

      {/* Installment Payment Modal */}
      {selectedInstallment && (
        <InstallmentPaymentModal
          installment={selectedInstallment}
          accountId={account.id}
          employeeId={employeeId}
          onClose={() => setSelectedInstallment(null)}
          onSave={async () => {
            setSelectedInstallment(null)
            // Wait for the parent to refresh account data, then installments will auto-refresh
            if (onRefresh) {
              await onRefresh()
            }
          }}
        />
      )}

      {/* Modify Installment Plan Modal */}
      {modifyingTransaction && (
        <ModifyInstallmentPlanModal
          transaction={modifyingTransaction}
          onClose={() => setModifyingTransaction(null)}
          onRefresh={() => {
            setModifyingTransaction(null)
            onRefresh?.()
          }}
        />
      )}

      {/* Delete Payment Confirmation */}
      <ConfirmationModal
        isOpen={deletePaymentId !== null}
        title="Delete Payment"
        message="Delete this payment record?\n\nThis action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={async () => {
          try {
            const res = await fetch(
              `/api/lms/installment-payment?transactionId=${deletePaymentId}&accountId=${account.id}`,
              { method: 'DELETE' }
            )
            if (!res.ok) throw new Error('Failed to delete')
            onRefresh?.()
            toast.success('Payment deleted')
            setDeletePaymentId(null)
          } catch (err) {
            toast.error('Failed to delete payment')
          }
        }}
        onCancel={() => setDeletePaymentId(null)}
      />

      {/* Skip Installment Confirmation */}
      <ConfirmationModal
        isOpen={skipInstallmentId !== null}
        title="Skip Installment"
        message="Skip this installment?\n\nRemaining unpaid installments will be recalculated evenly."
        confirmText="Skip"
        cancelText="Cancel"
        isDangerous={false}
        onConfirm={async () => {
          try {
            const res = await fetch('/api/lms/skip-installment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ installmentId: skipInstallmentId })
            })
            
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to skip')
            
            toast.success(`Installment skipped. ${data.remainingInstallments} installments recalculated to £${data.newAmountPerInstallment.toFixed(2)} each`)
            onRefresh?.()
            setSkipInstallmentId(null)
          } catch (err: any) {
            toast.error(err.message || 'Failed to skip installment')
          }
        }}
        onCancel={() => setSkipInstallmentId(null)}
      />
    </ModalWrapper>
  )
}
