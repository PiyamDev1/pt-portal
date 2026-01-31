'use client'

import { useParams } from 'next/navigation'
import { useStatementData } from '@/app/hooks/useStatementData'
import { useStatementFilters } from '@/app/hooks/useStatementFilters'
import { StatementHeader } from '../components/StatementHeader'
import { CustomerInfoSection } from '../components/CustomerInfoSection'
import { TransactionFilters } from '../components/TransactionFilters'
import { TransactionTable } from '../components/TransactionTable'
import { StatementTotals } from '../components/StatementTotals'
import { StatementActions } from '../components/StatementActions'
import { StatementPrintStyles } from '../components/StatementPrintStyles'

export default function StatementPage() {
  const params = useParams()
  const accountId = params.accountId as string

  const { loading, account, installmentsByTransaction } = useStatementData(accountId)
  const { filter, setFilter, handleDateInput, filteredTransactions, totals } = useStatementFilters(account)

  if (loading) return <div className="p-12 text-center text-slate-400" role="status" aria-live="polite">Loading statement...</div>
  if (!account) return <div className="p-12 text-center text-slate-400" role="alert" aria-live="assertive">Account not found</div>

  return (
    <div className="min-h-screen bg-white">
      <StatementHeader accountId={accountId} />


      {/* Print-Friendly Container */}
      <div className="max-w-4xl mx-auto p-6 space-y-6 print:p-0 print:space-y-4">
        <CustomerInfoSection account={account} />
        <TransactionFilters filter={filter} setFilter={setFilter} handleDateInput={handleDateInput} />
        <TransactionTable 
          filteredTransactions={filteredTransactions}
          account={account}
          installmentsByTransaction={installmentsByTransaction}
        />
        <StatementTotals totals={totals} account={account} hasTransactions={filteredTransactions.length > 0} />

        {/* Disclaimer Note */}
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded print:bg-amber-50 print:border-l-2 print:p-3 print:rounded-none">
          <p className="text-sm text-amber-900 font-semibold mb-1 print:text-xs print:mb-0.5">Important Notice</p>
          <p className="text-sm text-amber-800 print:text-xs print:leading-tight">
            This is not an invoice but a balance statement of your transactions with us. For specific detailed transaction information, please get in contact with our office.
          </p>
        </div>

        <StatementActions filteredTransactions={filteredTransactions} accountId={accountId} />
      </div>

      <StatementPrintStyles />
    </div>
  )
}

