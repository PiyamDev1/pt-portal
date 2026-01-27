import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { Account, Transaction } from '../types'

interface StatementPopupProps {
  account: Account
  onClose: () => void
  onAddPayment: (account: Account) => void
  onAddDebt: (account: Account) => void
}

const formatTransactionType = (type: string) => {
  const t = (type || '').toLowerCase()
  if (t === 'service') return 'Installment Plan'
  if (t === 'fee') return 'Service Fee'
  if (t === 'payment') return 'Payment'
  return type
}

/**
 * Statement Popup - Displays account transaction history and balance
 */
export function StatementPopup({
  account,
  onClose,
  onAddPayment,
  onAddDebt
}: StatementPopupProps) {
  const [runningBalance] = useState(account.balance || 0)
  const [loadingAction, setLoadingAction] = useState<'payment' | 'debt' | null>(null)

  const handleAddPayment = () => {
    setLoadingAction('payment')
    setTimeout(() => {
      onAddPayment(account)
      setLoadingAction(null)
    }, 100)
  }

  const handleAddDebt = () => {
    setLoadingAction('debt')
    setTimeout(() => {
      onAddDebt(account)
      setLoadingAction(null)
    }, 100)
  }

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
              </tr>
            </thead>
            <tbody>
              {account.transactions && account.transactions.length > 0 ? (
                account.transactions.map(
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

                    return (
                      <tr key={i} className="border-t border-slate-200 hover:bg-slate-50">
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
                          {tx.remark || '-'}
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
                      </tr>
                    )
                  }
                )
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400">
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
              onClick={handleAddPayment}
              disabled={loadingAction !== null}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'payment' ? <LoadingSpinner size="sm" /> : <Receipt className="w-4 h-4" />}
              {loadingAction === 'payment' ? 'Adding...' : 'Add Payment'}
            </button>
            <button
              onClick={handleAddDebt}
              disabled={loadingAction !== null}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingAction === 'debt' ? <LoadingSpinner size="sm" /> : null}
              {loadingAction === 'debt' ? 'Adding...' : 'Add Debt'}
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
    </ModalWrapper>
  )
}
