import type { Account, Transaction } from '../types'

const formatTransactionType = (type?: string) => {
  const t = (type || '').toLowerCase()
  if (t === 'service') return 'Installment Plan'
  if (t === 'fee') return 'Service Fee'
  if (t === 'payment') return 'Payment'
  return type || 'Unknown'
}

interface StatementTransactionsTableProps {
  localAccount: Account
  installmentsByTransaction: Record<string, any[]>
  onSelectInstallment: (installment: any) => void
  onDeletePayment: (id: string) => void
  onModifyTransaction: (tx: any) => void
  onSkipInstallment: (id: string) => void
}

export function StatementTransactionsTable({
  localAccount,
  installmentsByTransaction,
  onSelectInstallment,
  onDeletePayment,
  onModifyTransaction,
  onSkipInstallment
}: StatementTransactionsTableProps) {
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-100 text-[10px] uppercase text-slate-500">
          <tr>
            <th scope="col" className="p-2 text-left">Date</th>
            <th scope="col" className="p-2 text-left">Type</th>
            <th scope="col" className="p-2 text-left">Description</th>
            <th scope="col" className="p-2 text-right text-red-600">Debit</th>
            <th scope="col" className="p-2 text-right text-green-600">Credit</th>
            <th scope="col" className="p-2 text-center">Action</th>
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
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeletePayment(tx.id)
                          }}
                          className="px-1.5 py-0.5 text-[9px] bg-red-100 hover:bg-red-200 text-red-700 rounded"
                          type="button"
                          aria-label="Delete payment"
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
                              onModifyTransaction(tx)
                            }}
                            className="px-1.5 py-0.5 text-[9px] bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-bold"
                            aria-label="Modify service"
                          >
                            Modify
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )

                if (tType === 'service') {
                  const installments = installmentsByTransaction[tx.id] || []
                  const totalInstallments = installments.length

                  for (const installment of installments) {
                    const statusColor =
                      installment.status === 'paid' ? 'bg-green-100 text-green-700' :
                      installment.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                      installment.status === 'skipped' ? 'bg-gray-100 text-gray-600' :
                      installment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'

                    rows.push(
                      <tr
                        key={`install-${tx.id}-${installment.id}`}
                        onClick={() =>
                          onSelectInstallment({
                            id: installment.id,
                            date: installment.due_date,
                            amount: parseFloat(installment.amount),
                            amountPaid: parseFloat(installment.amount_paid || 0),
                            status: installment.status,
                            installmentNumber: installment.installment_number,
                            totalInstallments: totalInstallments,
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
                          <div>Installment {installment.installment_number}/{totalInstallments}</div>
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
                        <td className="p-2 text-center">
                          {installment.status !== 'paid' && installment.status !== 'skipped' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onSkipInstallment(installment.id)
                              }}
                              className="px-1.5 py-0.5 text-[9px] bg-amber-100 hover:bg-amber-200 text-amber-700 rounded font-bold"
                              type="button"
                              aria-label="Skip installment"
                            >
                              SKIP
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  }
                }

                return rows
              }
            )
          ) : (
            <tr>
              <td colSpan={6} className="p-4 text-center text-slate-400" role="status" aria-live="polite">
                No transactions found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
