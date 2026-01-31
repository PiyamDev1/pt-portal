'use client'

interface Transaction {
  id: string
  amount: number
  remark?: string
}

interface TransactionDetailsProps {
  transaction: Transaction
  totalInstallments: number
  paidInstallments: number
}

export function TransactionDetails({
  transaction,
  totalInstallments,
  paidInstallments
}: TransactionDetailsProps) {
  return (
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
  )
}
