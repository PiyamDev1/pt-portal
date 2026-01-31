import { Receipt } from 'lucide-react'
import type { Account } from '../types'

interface StatementFooterProps {
  account: Account
  onAddPayment: (account: Account) => void
  onAddDebt: (account: Account) => void
  onClose: () => void
}

export function StatementFooter({ account, onAddPayment, onAddDebt, onClose }: StatementFooterProps) {
  return (
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
  )
}
