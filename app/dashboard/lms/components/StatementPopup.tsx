'use client'

import { useState, useEffect } from 'react'
import { Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { InstallmentPaymentModal } from './InstallmentPaymentModal'
import { Account, Transaction } from '../types'

interface StatementPopupProps {
  account: Account
  employeeId: string
  onClose: () => void
  onAddPayment: (account: Account) => void
  onAddDebt: (account: Account) => void
  onRefresh?: () => void
}

const formatTransactionType = (type?: string) => {
  const t = (type || '').toLowerCase()
  if (t === 'service') return 'Installment Plan'
  if (t === 'fee') return 'Service Fee'
  if (t === 'payment') return 'Payment'
  return type || 'Unknown'
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
  const [runningBalance] = useState(account.balance || 0)
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null)
  const [installmentsByTransaction, setInstallmentsByTransaction] = useState<Record<string, any[]>>({})
  const [localAccount, setLocalAccount] = useState(account)

  // Sync localAccount with account prop when it changes
  useEffect(() => {
    setLocalAccount(account)
  }, [account])

  // Fetch installments for service transactions
  const fetchInstallments = async () => {
    console.log('[FETCH-INSTALLMENTS] Starting fetch...')
    if (!localAccount.transactions) return

    const serviceTransactions = localAccount.transactions.filter(
      (tx: any) => tx.transaction_type?.toLowerCase() === 'service'
    )

    console.log(`[FETCH-INSTALLMENTS] Found ${serviceTransactions.length} service transactions`)

    const installmentsMap: Record<string, any[]> = {}

    for (const tx of serviceTransactions) {
      try {
        const url = `/api/lms/installments?transactionId=${tx.id}`
        console.log(`[FETCH-INSTALLMENTS] Fetching ${url}`)
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          console.log(`[FETCH-INSTALLMENTS] Transaction ${tx.id.substring(0, 8)}: got ${data.installments?.length || 0} installments`)
          installmentsMap[tx.id] = data.installments || []
        }
      } catch (err) {
        console.error('Failed to fetch installments for transaction:', tx.id, err)
      }
    }

    console.log('[FETCH-INSTALLMENTS] Final map:', installmentsMap)
    setInstallmentsByTransaction(installmentsMap)
  }

  useEffect(() => {
    fetchInstallments()
  }, [localAccount.transactions])

  return (
    <ModalWrapper onClose={onClose} title={`Statement - ${account.name}`}>
      <div className="space-y-4">
        {/* Customer Header */}
        <div className="border-b pb-4">
          <h4 className="font-bold text-slate-800">{account.name}</h4>
          <p className="text-sm text-slate-600">Phone: {account.phone || 'N/A'}</p>
          <p className="text-sm text-slate-600">Email: {account.email || 'N/A'}</p>
          <div className="mt-2 p-2 bg-slate-100 rounded">
            <div className="text-xs text-slate-500">Current Balance</div>
            <div className="text-xl font-bold text-slate-900">
              £{(account.balance || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right text-red-600">Debit</th>
                <th className="p-2 text-right text-green-600">Credit</th>
                <th className="p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {localAccount.transactions && localAccount.transactions.length > 0 ? (
                localAccount.transactions.flatMap(
                  (
                    tx: Transaction & {
                      transaction_timestamp?: string
                      transaction_type?: string
                      remark?: string
                      loan_payment_methods?: { name: string }
                    },
                    i: number
                  ) => {
                    const tType = (tx.transaction_type || '').toLowerCase()
                    const isDebit = tType === 'service' || tType === 'fee'
                    const txAmount =
                      typeof tx.amount === 'number'
                        ? tx.amount
                        : parseFloat(tx.amount as unknown as string) || 0

                    const rows = []

                    // Main transaction row
                    rows.push(
                      <tr key={`tx-${i}`} className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer">
                        <td className="p-2 text-slate-600">
                          {new Date(tx.transaction_timestamp!).toLocaleDateString()}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.transaction_type === 'Service'
                                ? 'bg-blue-50 text-blue-700'
                                : tx.transaction_type === 'Payment'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-slate-50 text-slate-700'
                            }`}
                          >
                            {formatTransactionType(tx.transaction_type)}
                          </span>
                        </td>
                        <td className="p-2 text-slate-600 text-xs">
                          {tType === 'service' && (tx as any).loan_id ? (
                            <div>
                              <div className="text-[9px] text-slate-400 mb-0.5">
                                Ref: {(tx as any).loan_id.substring(0, 8)}
                              </div>
                              <div>{tx.remark || '-'}</div>
                            </div>
                          ) : (
                            tx.remark || '-'
                          )}
                          {tx.loan_payment_methods?.name && (
                            <div className="text-[9px] text-slate-400">
                              ({tx.loan_payment_methods.name})
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono text-red-600">
                          {isDebit ? `£${txAmount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono text-green-600">
                          {tType === 'payment' ? `£${txAmount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-2 text-center">
                          {tType === 'payment' && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (!confirm('Delete this payment?')) return
                                try {
                                  const res = await fetch(
                                    `/api/lms/installment-payment?transactionId=${tx.id}&accountId=${account.id}`,
                                    { method: 'DELETE' }
                                  )
                                  if (!res.ok) throw new Error('Failed to delete')
                                  onRefresh?.()
                                  toast.success('Payment deleted')
                                } catch (err) {
                                  toast.error('Failed to delete payment')
                                }
                              }}
                              className="px-1.5 py-0.5 text-[9px] bg-red-100 hover:bg-red-200 text-red-700 rounded"
                            >
                              Delete
                            </button>
                          )}
                          {tType === 'service' && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  
                                  console.log('[DELETE-PLAN] Button clicked!')
                                  alert('Delete button clicked! Check console for logs.')
                                  
                                const confirmed = window.confirm('Delete this service charge and all related installments? This will remove the entire transaction from the account.')
                                  
                                  (async () => {
                                    try {
                                      console.log(`[DELETE-PLAN] Starting delete for transaction ${tx.id}`)
                                      console.log(`[DELETE-PLAN] Current remark: "${tx.remark}"`)
                                      
                                      const url = `/api/lms/delete-installment-plan`
                                      console.log(`[DELETE-PLAN] Calling: ${url}`)
                                      
                                      const res = await fetch(url, { 
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ transactionId: tx.id })
                                      })
                                      
                                      console.log(`[DELETE-PLAN] Response status: ${res.status}`)
                                      
                                      const data = await res.json()
                                      console.log('[DELETE-PLAN] Response data:', data)
                                      
                                      if (!res.ok) {
                                        throw new Error(data.error || `Failed to delete (${res.status})`)
                                      }
                                      
                                      // Trigger server refresh to reload data
                                      if (onRefresh) {
                                        console.log('[DELETE-PLAN] Triggering onRefresh')
                                        onRefresh()
                                      }
                                      
                                      // Close modal after successful deletion
                                      onClose()
                                      
                                      toast.success('Service transaction deleted successfully')
                                    } catch (err: any) {
                                      console.error('[DELETE-PLAN] Error:', err)
                                      toast.error(err.message || 'Failed to delete')
                                    }
                                  })()
                                }}
                                className="px-1.5 py-0.5 text-[9px] bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold"
                              >
                                Delete Plan v2
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )

                    // If this is a service, show installment rows from database ONLY
                    if (tType === 'service') {
                      const installments = installmentsByTransaction[tx.id] || []
                      
                      console.log(`[STATEMENT] Service transaction ${tx.id.substring(0, 8)}: ${installments.length} installments from DB`)
                      
                      // Display ONLY database installments - no fallback generation
                      for (const installment of installments) {
                        const statusColor = 
                          installment.status === 'paid' ? 'bg-green-100 text-green-700' :
                          installment.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          installment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'

                        rows.push(
                          <tr
                            key={`install-${tx.id}-${installment.id}`}
                            onClick={() =>
                              setSelectedInstallment({
                                id: installment.id,
                                date: installment.due_date,
                                amount: parseFloat(installment.amount),
                                amountPaid: parseFloat(installment.amount_paid || 0),
                                status: installment.status,
                                installmentNumber: installment.installment_number,
                                loanId: (tx as any).loan_id,
                              })
                            }
                            className="border-t border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer text-[9px]"
                          >
                            <td className="p-2 text-slate-600">
                              {new Date(installment.due_date).toLocaleDateString()}
                            </td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${statusColor}`}>
                                {installment.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-2 text-slate-600 text-[10px]">
                              <div>Installment #{installment.installment_number}</div>
                              <div className="text-[9px] text-slate-400">
                                Ref: {tx.id.substring(0, 8)} | ID: {installment.id.substring(0, 8)}
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono text-blue-700 font-bold">
                              £{parseFloat(installment.amount).toFixed(2)}
                            </td>
                            <td className="p-2 text-right text-slate-400">
                              {installment.amount_paid > 0 ? `£${parseFloat(installment.amount_paid).toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2"></td>
                          </tr>
                        )
                      }
                    }

                    return rows
                  }
                )
              ) : (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 pt-4 border-t">
          <div className="flex gap-2">
            <button
              onClick={() => onAddPayment(account)}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              Add Payment
            </button>
            <button
              onClick={() => onAddDebt(account)}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              Add Debt
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-lg transition-colors text-sm"
            >
              Close
            </button>
          </div>
          <a
            href={`/dashboard/lms/statement/${account.id}`}
            target="_blank"
            className="block text-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors text-sm"
          >
            View Full Statement (Printable)
          </a>
        </div>
      </div>

      {/* Installment Payment Modal */}
      {selectedInstallment && (
        <InstallmentPaymentModal
          installment={selectedInstallment}
          accountId={account.id}
          employeeId={employeeId}
          onClose={() => setSelectedInstallment(null)}
          onSave={() => {
            onRefresh?.()
            fetchInstallments() // Explicitly refetch installments after payment
            setSelectedInstallment(null)
          }}
        />
      )}
    </ModalWrapper>
  )
}
