import { generateInstallmentSchedule } from '../utils/statementUtils'
import { Account, InstallmentPayment } from '@/app/types/lms'
import { memo } from 'react'

interface TransactionTableProps {
  filteredTransactions: any[]
  account: Account
  installmentsByTransaction: Record<string, InstallmentPayment[]>
}

interface Transaction {
  id: string
  transaction_timestamp: string
  transaction_type: string
  amount: string
  remark?: string
  loan_payment_methods?: { name: string }
}

function TransactionTableComponent({ filteredTransactions, account, installmentsByTransaction }: TransactionTableProps) {
  const parseAmount = (val: string | number): number => {
    if (typeof val === 'number') return val
    return parseFloat(val) || 0
  }

  const getStatusColor = (status: string): string => {
    const statusColorMap: Record<string, string> = {
      'paid': 'bg-green-100 text-green-700',
      'partial': 'bg-yellow-100 text-yellow-700',
      'skipped': 'bg-gray-100 text-gray-600',
      'overdue': 'bg-red-100 text-red-700',
    }
    return statusColorMap[status] || 'bg-blue-100 text-blue-700'
  }

  const getTransactionBadgeColor = (type: string): string => {
    const typeMap: Record<string, string> = {
      'service': 'bg-blue-50 text-blue-700',
      'payment': 'bg-green-50 text-green-700',
      'fee': 'bg-slate-50 text-slate-700',
    }
    return typeMap[type.toLowerCase()] || 'bg-slate-50 text-slate-700'
  }

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-sm border-collapse print:text-xs">
        <thead>
          <tr className="bg-slate-100 border-b-2 border-slate-900 print:bg-slate-200">
            <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase print:p-2 print:text-[9px]">Date</th>
            <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase print:p-2 print:text-[9px]">Type</th>
            <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase print:p-2 print:text-[9px]">Description</th>
            <th className="p-3 text-right text-xs font-bold text-red-700 uppercase print:p-2 print:text-[9px]">Debit</th>
            <th className="p-3 text-right text-xs font-bold text-green-700 uppercase print:p-2 print:text-[9px]">Credit</th>
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.length > 0 ? (
            filteredTransactions.flatMap((tx: Transaction, i: number) => {
              const isDebit = ((tx.transaction_type || '').toLowerCase() === 'service') || ((tx.transaction_type || '').toLowerCase() === 'fee')
              const txAmount = parseAmount(tx.amount)
              const isService = ((tx.transaction_type || '').toLowerCase() === 'service')
              
              // Find the associated loan to get installment plan info
              const serviceLoan = isService && account.loans 
                ? account.loans.find((l: any) => 
                    l.created_at && new Date(l.created_at).toDateString() === new Date(tx.transaction_timestamp).toDateString()
                  )
                : null
              
              const rows = []
              
              // Original Transaction Row
              rows.push(
                <tr key={`tx-${i}`} className="border-b border-slate-200 hover:bg-slate-50 print:hover:bg-white">
                  <td className="p-3 text-slate-600 print:p-2 print:text-xs">{new Date(tx.transaction_timestamp).toLocaleDateString()}</td>
                  <td className="p-3 print:p-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold print:px-1 print:py-0 print:text-[8px] ${
                      isService ? 'bg-blue-50 text-blue-700' :
                      ((tx.transaction_type || '').toLowerCase() === 'payment') ? 'bg-green-50 text-green-700' :
                      'bg-slate-50 text-slate-700'
                    }`}>
                      {isService ? 'INSTALLMENT' : (tx.transaction_type || '').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 print:p-2 print:text-xs">
                    <div>{tx.remark || '-'}</div>
                    {isService && <div className="text-xs text-slate-500 print:text-[7px]">Service Plan: {tx.id.substring(0, 8)}</div>}
                    {tx.loan_payment_methods?.name && <div className="text-xs text-slate-400 print:text-[7px]">({tx.loan_payment_methods.name})</div>}
                  </td>
                  <td className="p-3 text-right font-mono text-red-700 font-bold print:p-2 print:text-xs">
                    {isDebit ? `£${txAmount.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-green-700 font-bold print:p-2 print:text-xs">
                    {((tx.transaction_type || '').toLowerCase() === 'payment') ? `£${txAmount.toFixed(2)}` : '-'}
                  </td>
                </tr>
              )

              {/* Actual Installment Rows from Database */}
              if (isService) {
                const installments = installmentsByTransaction[tx.id] || []
                const totalInstallments = installments.length
                
                if (installments.length > 0) {
                  // Display actual installments from database
                  installments.forEach((installment: InstallmentPayment, idx: number) => {
                    const statusColor = getStatusColor(installment.status)
                    
                    rows.push(
                      <tr key={`install-${tx.id}-${installment.id}`} className="border-b border-slate-200 bg-blue-50 hover:bg-blue-100 print:bg-blue-50 print:hover:bg-blue-50">
                        <td className="p-3 text-slate-600 print:p-2 print:text-xs">{new Date(installment.due_date).toLocaleDateString()}</td>
                        <td className="p-3 print:p-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold print:px-1 print:py-0 print:text-[8px] ${statusColor}`}>
                            {installment.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 text-sm print:p-2 print:text-xs">
                          <div>Installment {installment.installment_number}/{totalInstallments}</div>
                          <div className="text-xs text-slate-500 print:text-[7px]">Plan: {tx.id.substring(0, 8)} | ID: {installment.id.substring(0, 8)}</div>
                        </td>
                        <td className="p-3 text-right font-mono text-blue-700 font-bold print:p-2 print:text-xs">
                          £{(installment.status === 'paid' ? installment.amount_paid : installment.status === 'skipped' ? 0 : installment.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400 print:p-2 print:text-xs">
                          {parseAmount(installment.amount_paid) > 0 ? `£${parseAmount(installment.amount_paid).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    )
                  })
                } else {
                  // Fallback to generated schedule if no DB installments
                  if (serviceLoan && serviceLoan.term_months) {
                    const sameDay = new Date(tx.transaction_timestamp).toDateString()
                    const depositAmount = filteredTransactions
                      .filter((t: Transaction) => 
                        (t.transaction_type || '').toLowerCase() === 'payment' &&
                        new Date(t.transaction_timestamp).toDateString() === sameDay
                      )
                      .reduce((sum: number, t: Transaction) => sum + parseAmount(t.amount), 0)
                    
                    const scheduleRows = generateInstallmentSchedule(
                      tx.transaction_timestamp,
                      txAmount,
                      depositAmount || txAmount * 0.17,
                      Number(serviceLoan.term_months),
                      serviceLoan.next_due_date
                    )
                    
                    scheduleRows.forEach((installment: any, idx: number) => {
                      rows.push(
                        <tr key={`install-${i}-${idx}`} className="border-b border-slate-200 bg-blue-50 hover:bg-blue-100 print:bg-blue-50 print:hover:bg-blue-50">
                          <td className="p-3 text-slate-600 print:p-2 print:text-xs">{new Date(installment.date).toLocaleDateString()}</td>
                          <td className="p-3 print:p-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 print:px-1 print:py-0 print:text-[8px] print:bg-blue-100">
                              PLAN
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 text-sm print:p-2 print:text-xs">
                            <div>Total £{txAmount.toFixed(2)}, Remaining £{installment.remaining.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 print:text-[7px]">Term {idx + 1}/{serviceLoan.term_months} | Plan: {tx.id.substring(0, 8)}</div>
                          </td>
                          <td className="p-3 text-right font-mono text-amber-700 font-bold print:p-2 print:text-xs">
                            £{installment.amount.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400 print:p-2 print:text-xs">-</td>
                        </tr>
                      )
                    })
                  }
                }
              }
              
              return rows
            })
          ) : (
            <tr>
              <td colSpan={5} className="p-6 text-center text-slate-400 print:p-3 print:text-xs">
                No transactions found for the selected filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Memoize to prevent re-renders on parent updates
export const TransactionTable = memo(TransactionTableComponent)
