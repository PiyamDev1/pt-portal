'use client'

import { ArrowLeft, Download, Printer } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatToDisplayDate } from '@/app/lib/dateFormatter'
import { useStatementData } from '@/app/hooks/useStatementData'
import { useStatementFilters } from '@/app/hooks/useStatementFilters'

export default function StatementPage() {
  const params = useParams()
  const accountId = params.accountId as string

  const { loading, account, installmentsByTransaction } = useStatementData(accountId)
  const { filter, setFilter, handleDateInput, filteredTransactions, totals } = useStatementFilters(account)

  if (loading) return <div className="p-12 text-center text-slate-400">Loading statement...</div>
  if (!account) return <div className="p-12 text-center text-slate-400">Account not found</div>

  // filteredTransactions and totals now handled by useStatementFilters

  return (
    <div className="min-h-screen bg-white">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 print:hidden">
        <Link href="/dashboard/lms" className="inline-flex items-center gap-2 text-white hover:text-slate-200 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Accounts
        </Link>
        <h1 className="text-3xl font-bold">Statement</h1>
      </div>

      {/* Print-Friendly Container */}
      <div className="max-w-4xl mx-auto p-6 space-y-6 print:p-0 print:space-y-4">
        {/* Letterhead */}
        <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between gap-6 print:gap-3 print:pb-2">
          <div className="print:w-24 flex-shrink-0">
            <img src="/logo.png" alt="Company Logo" className="h-24 w-auto print:h-28 print:w-auto" />
          </div>
          <div className="flex-1 text-right print:text-right">
            <h2 className="text-xl font-bold text-slate-900 print:text-base print:mb-0">Piyam Travel</h2>
            <p className="text-slate-600 print:text-xs print:mb-0">290A Dunstable Road, LU4 8JN, Luton</p>
            <p className="text-slate-600 print:text-xs print:mb-0">01582 968538</p>
            <p className="text-slate-600 print:text-xs print:mb-0">Accounts@piyamtravel.com</p>
            <p className="text-xs text-slate-400 mt-2 print:text-[10px] print:mt-1">Document Reference: STM-{account.id.substring(0, 8).toUpperCase()}</p>
          </div>
        </div>

        {/* Customer & Period Info */}
        <div className="grid grid-cols-2 gap-6 print:gap-8 print:text-xs">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 print:text-[10px] print:mb-1">Customer Details</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900 print:text-xs print:mb-0">{account.name}</p>
              <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.phone}</p>
              <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.email}</p>
              <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.address || 'N/A'}</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 print:text-[10px] print:mb-1">Statement Details</h3>
            <div className="space-y-1">
              <p className="text-sm print:text-xs print:mb-0"><span className="text-slate-600">Date:</span> <span className="font-bold">{new Date().toLocaleDateString()}</span></p>
              <p className="text-sm print:text-xs print:mb-0"><span className="text-slate-600">Period:</span> <span className="font-bold">Full Account History</span></p>
              <p className="text-sm print:text-xs print:mb-0"><span className="text-slate-600">Status:</span> <span className="font-bold text-blue-600">{account.status?.toUpperCase()}</span></p>
              <p className="text-sm print:text-xs print:mb-0"><span className="text-slate-600">Balance:</span> <span className="font-bold text-slate-900">£{(account.balance || 0).toLocaleString()}</span></p>
            </div>
          </div>
        </div>

        {/* Filters (Screen Only) */}
        <div className="bg-slate-50 p-4 rounded-lg space-y-3 print:hidden">
          <h3 className="font-bold text-sm text-slate-700">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Transaction Type</label>
              <select 
                value={filter.type} 
                onChange={e => setFilter({...filter, type: e.target.value})}
                className="w-full p-2 border rounded text-sm"
              >
                <option value="">All Types</option>
                <option value="service">Debt Added</option>
                <option value="payment">Payment</option>
                <option value="fee">Fee</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">From Date (DD/MM/YYYY)</label>
              <input 
                type="text" 
                placeholder="DD/MM/YYYY"
                value={filter.dateFrom}
                onChange={e => setFilter({...filter, dateFrom: handleDateInput(e.target.value)})}
                className="w-full p-2 border rounded text-sm"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">To Date (DD/MM/YYYY)</label>
              <input 
                type="text" 
                placeholder="DD/MM/YYYY"
                value={filter.dateTo}
                onChange={e => setFilter({...filter, dateTo: handleDateInput(e.target.value)})}
                className="w-full p-2 border rounded text-sm"
                maxLength={10}
              />
            </div>
          </div>
        </div>

        {/* Transaction Table with Installment Schedule */}
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
                filteredTransactions.flatMap((tx: any, i: number) => {
                  const isDebit = ((tx.transaction_type || '').toLowerCase() === 'service') || ((tx.transaction_type || '').toLowerCase() === 'fee')
                  const txAmount = parseFloat(tx.amount) || 0
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
                      installments.forEach((installment: any, idx: number) => {
                        const statusColor = 
                          installment.status === 'paid' ? 'bg-green-100 text-green-700' :
                          installment.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          installment.status === 'skipped' ? 'bg-gray-100 text-gray-600' :
                          installment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        
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
                              £{(installment.status === 'paid' ? installment.amount_paid : installment.status === 'skipped' ? 0 : parseFloat(installment.amount)).toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400 print:p-2 print:text-xs">
                              {installment.amount_paid > 0 ? `£${parseFloat(installment.amount_paid).toFixed(2)}` : '-'}
                            </td>
                          </tr>
                        )
                      })
                    } else {
                      // Fallback to generated schedule if no DB installments
                      if (serviceLoan && serviceLoan.term_months) {
                        const sameDay = new Date(tx.transaction_timestamp).toDateString()
                        const depositAmount = filteredTransactions
                          .filter((t: any) => 
                            (t.transaction_type || '').toLowerCase() === 'payment' &&
                            new Date(t.transaction_timestamp).toDateString() === sameDay
                          )
                          .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0)
                        
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
                  <td colSpan={5} className="p-6 text-center text-slate-400 print:p-3 print:text-xs">No transactions found for the selected filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        {filteredTransactions.length > 0 && (
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
        )}

        {/* Disclaimer Note */}
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded print:bg-amber-50 print:border-l-2 print:p-3 print:rounded-none">
          <p className="text-sm text-amber-900 font-semibold mb-1 print:text-xs print:mb-0.5">Important Notice</p>
          <p className="text-sm text-amber-800 print:text-xs print:leading-tight">
            This is not an invoice but a balance statement of your transactions with us. For specific detailed transaction information, please get in contact with our office.
          </p>
        </div>

        {/* Action Buttons (Screen Only) */}
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
              downloadCSV(csv, `statement-${account.id}.csv`)
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          /* Core page setup */
          html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
            width: 100%;
          }
          
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          
          /* Color preservation for print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          /* Hide screen-only elements */
          .print\\:hidden {
            display: none !important;
          }
          
          /* Container sizing */
          .min-h-screen {
            min-height: auto;
            height: auto;
          }
          
          .max-w-4xl {
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 8mm !important;
          }
          
          /* Letterhead section */
          .border-b-2 {
            border-bottom: 2px solid #000 !important;
            page-break-after: avoid;
            margin-bottom: 9px !important;
            padding-bottom: 7px !important;
          }
          
          img {
            max-width: 160px !important;
            height: auto !important;
            display: block;
          }
          
          /* Typography - Standardized sizes */
          h1, h2, h3 {
            page-break-after: avoid;
            margin: 0;
          }
          
          h2 {
            font-size: 14px !important;
            margin-bottom: 3px !important;
          }
          
          h3 {
            font-size: 12px !important;
            margin-bottom: 5px !important;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          p {
            margin: 0;
            font-size: 12px !important;
            line-height: 1.3;
          }
          
          /* Customer & Period Info Grid */
          .grid {
            page-break-inside: avoid;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 6px !important;
          }
          
          .grid > div {
            page-break-inside: avoid;
          }
          
          .grid p {
            font-size: 12px !important;
            margin: 3px 0 !important;
          }
          
          .grid .space-y-1 > p {
            margin: 2px 0 !important;
          }
          
          /* Spacing */
          .space-y-6 > * + * {
            margin-top: 7px !important;
          }
          
          .space-y-2 > * + * {
            margin-top: 3px !important;
          }
          
          .space-y-1 > * + * {
            margin-top: 2px !important;
          }
          
          /* Table Styling - Unified approach */
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
            margin: 7px 0 !important;
            font-family: Arial, sans-serif;
            font-size: 12px !important;
            line-height: 1.4;
            table-layout: fixed;
          }
          
          thead {
            page-break-after: avoid;
            display: table-header-group;
          }
          
          tbody {
            display: table-row-group;
          }
          
          tr {
            page-break-inside: avoid;
          }
          
          th {
            background-color: #e5e7eb !important;
            color: #000 !important;
            font-weight: 700;
            font-size: 12px !important;
            padding: 5px 6px !important;
            text-align: left;
            border-bottom: 2px solid #000 !important;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          td {
            padding: 5px 6px !important;
            border-bottom: 1px solid #d1d5db !important;
            font-size: 12px !important;
            text-align: left;
            line-height: 1.3;
          }
          
          /* Table column specifics */
          td:nth-child(4),
          td:nth-child(5) {
            text-align: right;
            font-family: 'Courier New', monospace;
            font-size: 12px !important;
          }

          /* Column widths for alignment */
          th:nth-child(1), td:nth-child(1) { width: 14%; }
          th:nth-child(2), td:nth-child(2) { width: 16%; }
          th:nth-child(3), td:nth-child(3) { width: 40%; }
          th:nth-child(4), td:nth-child(4) { width: 15%; }
          th:nth-child(5), td:nth-child(5) { width: 15%; }
          
          /* Remove hover effects */
          tbody tr:hover {
            background-color: transparent !important;
          }
          
          /* Row backgrounds */
          .bg-blue-50 {
            background-color: #eff6ff !important;
          }
          
          .bg-blue-100 {
            background-color: #dbeafe !important;
          }
          
          /* Text colors */
          .text-red-700 {
            color: #b91c1c !important;
          }
          
          .text-green-700 {
            color: #15803d !important;
          }
          
          .text-blue-700 {
            color: #1d4ed8 !important;
          }
          
          .text-amber-700 {
            color: #b45309 !important;
          }
          
          .text-slate-600 {
            color: #475569 !important;
          }
          
          .text-slate-400 {
            color: #cbd5e1 !important;
          }
          
          /* Disclaimer box */
          .bg-amber-50 {
            background-color: #fffbeb !important;
            border-left: 3px solid #f59e0b !important;
            padding: 5px 7px !important;
            margin: 7px 0 !important;
            page-break-inside: avoid;
          }
          
          .bg-amber-50 p {
            font-size: 12px !important;
            margin: 3px 0 !important;
            line-height: 1.3;
          }
          
          .text-amber-900 {
            color: #78350f !important;
            font-weight: 600;
            font-size: 12px !important;
          }
          
          .text-amber-800 {
            color: #92400e !important;
            font-size: 12px !important;
          }
          
          /* Totals section */
          .border-t-2 {
            border-top: 2px solid #000 !important;
            page-break-before: avoid;
            margin-top: 7px !important;
            padding-top: 5px !important;
          }
          
          .border-t-2 .space-y-2 > div {
            display: flex;
            justify-content: space-between;
            font-size: 12px !important;
            margin: 3px 0 !important;
            page-break-inside: avoid;
          }
          
          .border-t-2 span {
            font-size: 12px !important;
          }
          
          .text-lg {
            font-size: 14px !important;
          }
          
          /* Badge styling */
          .px-2.py-0\\.5 {
            padding: 1px 2px !important;
            font-size: 9px !important;
          }
          
          .text-\\[11px\\] {
            font-size: 9px !important;
          }
          
          /* Font for all elements */
          body, p, td, th, span, div {
            font-family: Arial, sans-serif !important;
          }
        }
      `}</style>
    </div>
  )
}

function generateInstallmentSchedule(
  startDate: string,
  totalAmount: number,
  initialDeposit: number,
  termMonths: number,
  nextDueDate?: string
) {
  // Calculate the remaining amount after initial deposit
  const remainingAfterDeposit = totalAmount - initialDeposit
  // Divide equally across all terms
  const installmentAmount = remainingAfterDeposit / termMonths
  const schedule = []
  
  const firstDueDate = nextDueDate ? new Date(nextDueDate) : new Date(startDate)
  
  for (let i = 0; i < termMonths; i++) {
    const dueDate = new Date(firstDueDate)
    dueDate.setMonth(dueDate.getMonth() + i)
    
    // Calculate remaining balance after this installment
    const remaining = remainingAfterDeposit - (installmentAmount * (i + 1))
    schedule.push({
      date: dueDate.toISOString(),
      amount: installmentAmount,
      remaining: Math.max(0, remaining)
    })
  }
  
  return schedule
}

function generateCSV(transactions: any[]) {
  const headers = ['Date', 'Type', 'Description', 'Debit', 'Credit']
  const rows = transactions.map(tx => [
    new Date(tx.transaction_timestamp).toLocaleDateString(),
    (tx.transaction_type || '').toLowerCase(),
    tx.remark || '',
    ((tx.transaction_type || '').toLowerCase() === 'service' || (tx.transaction_type || '').toLowerCase() === 'fee') ? parseFloat(tx.amount).toFixed(2) : '',
    ((tx.transaction_type || '').toLowerCase() === 'payment') ? parseFloat(tx.amount).toFixed(2) : ''
  ])
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n')
  
  return csv
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}
