import { Account } from '@/app/types/lms'

interface Totals {
  debits: number
  credits: number
}

interface StatementTotalsProps {
  totals: Totals
  account: Account
  hasTransactions: boolean
}

export function StatementTotals({ totals, account, hasTransactions }: StatementTotalsProps) {
  if (!hasTransactions) return null

  return (
    <div className="border-t-2 border-slate-900 pt-4 flex justify-end print:pt-2">
      <div className="w-64 space-y-2 print:space-y-1 print:text-xs">
        <div className="flex justify-between text-sm print:text-xs">
          <span className="text-slate-600">Total Debits:</span>
          <span className="font-bold text-red-700">£{totals.debits.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm print:text-xs">
          <span className="text-slate-600">Total Credits:</span>
          <span className="font-bold text-green-700">£{totals.credits.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm border-t-2 border-slate-900 pt-2 print:pt-1 print:text-xs">
          <span className="font-bold text-slate-900">Current Balance:</span>
          <span className="font-bold text-slate-900 text-lg print:text-base">£{(account.balance || 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
