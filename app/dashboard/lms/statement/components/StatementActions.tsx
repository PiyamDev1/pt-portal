import { Download, Printer } from 'lucide-react'
import { generateCSV, downloadCSV } from '../utils/statementUtils'
import { memo } from 'react'

interface StatementActionsProps {
  filteredTransactions: any[]
  accountId: string
}

function StatementActionsComponent({ filteredTransactions, accountId }: StatementActionsProps) {
  return (
    <div className="flex gap-3 print:hidden">
      <button
        onClick={() => window.print()}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-lg transition-colors"
      >
        <Printer className="w-4 h-4" />
        Print Statement
      </button>
      <button
        onClick={() => {
          const csv = generateCSV(filteredTransactions)
          downloadCSV(csv, `statement-${accountId}.csv`)
        }}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-lg transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
    </div>
  )
}

export const StatementActions = memo(StatementActionsComponent)
