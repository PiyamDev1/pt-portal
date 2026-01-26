'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function StatementPage() {
  const params = useParams()
  const accountId = params.accountId as string
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<any>(null)
  const [filter, setFilter] = useState({ type: '', dateFrom: '', dateTo: '' })

  useEffect(() => {
    // Fetch account details
    fetch(`/api/lms?accountId=${accountId}`)
      .then(res => res.json())
      .then(data => {
        const acc = data.accounts?.find((a: any) => a.id === accountId)
        setAccount(acc)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [accountId])

  if (loading) return <div className="p-12 text-center text-slate-400">Loading statement...</div>
  if (!account) return <div className="p-12 text-center text-slate-400">Account not found</div>

  // Filter transactions
  const filteredTransactions = account.transactions?.filter((tx: any) => {
    const tType = (tx.transaction_type || '').toLowerCase()
    const fType = (filter.type || '').toLowerCase()
    if (fType && tType !== fType) return false
    if (filter.dateFrom && new Date(tx.transaction_timestamp) < new Date(filter.dateFrom)) return false
    if (filter.dateTo && new Date(tx.transaction_timestamp) > new Date(filter.dateTo)) return false
    return true
  }) || []

  // Calculate totals
  const totals = {
    debits: filteredTransactions.filter((tx: any) => {
      const t = (tx.transaction_type || '').toLowerCase()
      return t === 'service' || t === 'fee'
    }).reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0),
    credits: filteredTransactions.filter((tx: any) => {
      const t = (tx.transaction_type || '').toLowerCase()
      return t === 'payment'
    }).reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6">
        <Link href="/dashboard/lms" className="inline-flex items-center gap-2 text-white hover:text-slate-200 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Accounts
        </Link>
        <h1 className="text-3xl font-bold">Statement</h1>
      </div>

      {/* Print-Friendly Container */}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Letterhead */}
        <div className="border-b-2 border-slate-900 pb-4 flex items-start gap-6">
          <div className="print:w-32 print:h-auto">
            <img src="/logo.png" alt="Company Logo" className="h-20 w-51 print:h-20 print:w-51" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">Piyam Travel</h2>
            <p className="text-slate-600">290A Dunstable Road, LU4 8JN, Luton</p>
            <p className="text-slate-600">01582 968538</p>
            <p className="text-slate-600">Accounts@piyamtravel.com</p>
            <p className="text-xs text-slate-400 mt-2">Document Reference: STM-{account.id.substring(0, 8).toUpperCase()}</p>
          </div>
        </div>

        {/* Customer & Period Info */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Customer Details</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{account.name}</p>
              <p className="text-sm text-slate-600">{account.phone}</p>
              <p className="text-sm text-slate-600">{account.email}</p>
              <p className="text-sm text-slate-600">{account.address || 'N/A'}</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Statement Details</h3>
            <div className="space-y-1">
              <p className="text-sm"><span className="text-slate-600">Date:</span> <span className="font-bold">{new Date().toLocaleDateString()}</span></p>
              <p className="text-sm"><span className="text-slate-600">Period:</span> <span className="font-bold">Full Account History</span></p>
              <p className="text-sm"><span className="text-slate-600">Account Status:</span> <span className="font-bold text-blue-600">{account.status?.toUpperCase()}</span></p>
              <p className="text-sm"><span className="text-slate-600">Outstanding Balance:</span> <span className="font-bold text-slate-900">£{(account.balance || 0).toLocaleString()}</span></p>
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
              <label className="text-xs font-bold text-slate-600 block mb-1">From Date</label>
              <input 
                type="date" 
                value={filter.dateFrom}
                onChange={e => setFilter({...filter, dateFrom: e.target.value})}
                className="w-full p-2 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">To Date</label>
              <input 
                type="date" 
                value={filter.dateTo}
                onChange={e => setFilter({...filter, dateTo: e.target.value})}
                className="w-full p-2 border rounded text-sm"
              />
            </div>
          </div>
        </div>

        {/* Transaction Table with Installment Schedule */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-900">
                <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase">Date</th>
                <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase">Type</th>
                <th className="p-3 text-left text-xs font-bold text-slate-700 uppercase">Description</th>
                <th className="p-3 text-right text-xs font-bold text-red-700 uppercase">Debit</th>
                <th className="p-3 text-right text-xs font-bold text-green-700 uppercase">Credit</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length > 0 ? (
                <>
                  {filteredTransactions.map((tx: any, i: number) => {
                    const isDebit = ((tx.transaction_type || '').toLowerCase() === 'service') || ((tx.transaction_type || '').toLowerCase() === 'fee')
                    const txAmount = parseFloat(tx.amount) || 0
                    const isService = ((tx.transaction_type || '').toLowerCase() === 'service')
                    
                    // Find the associated loan to get installment plan info
                    const serviceLoan = isService && account.loans 
                      ? account.loans.find((l: any) => 
                          l.created_at && new Date(l.created_at).toDateString() === new Date(tx.transaction_timestamp).toDateString()
                        )
                      : null
                    
                    return (
                      <tbody key={i}>
                        {/* Original Transaction Row */}
                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="p-3 text-slate-600">{new Date(tx.transaction_timestamp).toLocaleDateString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isService ? 'bg-blue-50 text-blue-700' :
                              ((tx.transaction_type || '').toLowerCase() === 'payment') ? 'bg-green-50 text-green-700' :
                              'bg-slate-50 text-slate-700'
                            }`}>
                              {isService ? 'Installment Plan' : (tx.transaction_type || '').toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            <div>{tx.remark || '-'}</div>
                            {tx.loan_payment_methods?.name && <div className="text-xs text-slate-400">({tx.loan_payment_methods.name})</div>}
                          </td>
                          <td className="p-3 text-right font-mono text-red-700 font-bold">
                            {isDebit ? `£${txAmount.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-green-700 font-bold">
                            {((tx.transaction_type || '').toLowerCase() === 'payment') ? `£${txAmount.toFixed(2)}` : '-'}
                          </td>
                        </tr>

                        {/* Installment Schedule Rows (if this is a service with future installments) */}
                        {isService && serviceLoan && serviceLoan.term_months && (
                          <>
                            {generateInstallmentSchedule(
                              tx.transaction_timestamp,
                              txAmount,
                              serviceLoan.current_balance + (parseFloat(serviceLoan.total_debt_amount || 0) * 0.17), // Approximate deposit
                              serviceLoan.term_months,
                              serviceLoan.next_due_date
                            ).map((installment: any, idx: number) => (
                              <tr key={`installment-${i}-${idx}`} className="border-b border-slate-200 bg-blue-50 hover:bg-blue-100">
                                <td className="p-3 text-slate-600">{new Date(installment.date).toLocaleDateString()}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700">
                                    INSTALLMENT PLAN
                                  </span>
                                </td>
                                <td className="p-3 text-slate-600 text-sm">
                                  <div>Total £{txAmount.toFixed(2)}, Remaining £{installment.remaining.toFixed(2)}</div>
                                  <div className="text-xs text-slate-500">Term {idx + 1}/{serviceLoan.term_months}</div>
                                </td>
                                <td className="p-3 text-right font-mono text-amber-700 font-bold">
                                  £{installment.amount.toFixed(2)}
                                </td>
                                <td className="p-3 text-right font-mono text-slate-400">-</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    )
                  })}
                </>
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">No transactions found for the selected filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        {filteredTransactions.length > 0 && (
          <div className="border-t-2 border-slate-900 pt-4 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Debits:</span>
                <span className="font-bold text-red-700">£{totals.debits.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Credits:</span>
                <span className="font-bold text-green-700">£{totals.credits.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t-2 border-slate-900 pt-2">
                <span className="font-bold text-slate-900">Current Balance:</span>
                <span className="font-bold text-slate-900 text-lg">£{(account.balance || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer Note */}
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
          <p className="text-sm text-amber-900 font-semibold mb-1">Important Notice</p>
          <p className="text-sm text-amber-800">
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
          * {
            background: white !important;
            color: black !important;
          }
          
          body {
            background: white;
            margin: 0;
            padding: 0;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .min-h-screen {
            min-height: auto;
          }
          
          .bg-gradient-to-r {
            background: white !important;
            color: black !important;
          }
          
          .max-w-4xl {
            max-width: 100%;
            margin: 0;
            padding: 12px;
          }
          
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 8mm 8mm;
          }
          
          h1, h2, h3 {
            page-break-after: avoid;
          }
          
          /* Logo and Letterhead */
          img {
            max-width: 100%;
            height: auto;
            max-height: 80px !important;
            width: auto !important;
            display: block;
          }
          
          .print\\:w-32 {
            width: auto !important;
            max-width: 128px !important;
          }
          
          .print\\:h-auto {
            height: auto !important;
          }
          
          .border-b-2 {
            border-bottom: 2px solid black !important;
            page-break-after: avoid;
          }
          
          /* Section Spacing */
          .border-b.pb-4 {
            page-break-after: avoid;
          }
          
          .border-t.pt-6 {
            page-break-before: avoid;
          }
          
          .border-t-2.border-slate-900 {
            border-top: 1px solid black !important;
            margin-top: 6px !important;
            padding-top: 4px !important;
          }
          
          /* Grid and text sizing for sections */
          .grid {
            page-break-inside: avoid;
            margin-bottom: 4px;
          }
          
          .grid p {
            font-size: 8px;
            margin: 2px 0;
            line-height: 1.2;
          }
          
          .space-y-6 > * + * {
            margin-top: 6px !important;
          }
          
          .space-y-2 > * + * {
            margin-top: 2px !important;
          }
          
          /* Table Styles - Bank Statement Style */
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: avoid;
            margin: 8px 0;
            font-size: 8px;
            line-height: 1.2;
          }
          
          thead {
            page-break-after: avoid;
            background-color: #f0f0f0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          th {
            background-color: #f0f0f0 !important;
            color: #000 !important;
            font-weight: 600;
            border-bottom: 1px solid #000;
            padding: 3px 2px;
            text-align: left;
            font-size: 7px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          td {
            border-bottom: 1px solid #ddd;
            padding: 3px 2px;
            text-align: left;
            font-size: 8px;
            line-height: 1.1;
          }
          
          tr {
            page-break-inside: avoid;
          }
          
          /* Description column - allow wrapping */
          td:nth-child(3) {
            max-width: 140px;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          
          /* Currency columns - right align, monospace */
          td:nth-child(4),
          td:nth-child(5) {
            text-align: right;
            font-family: 'Courier New', monospace;
            width: 40px;
          }
          
          /* Remove alternating row background for print */
          tbody tr:nth-child(even) {
            background-color: white !important;
          }
          
          /* Disclaimer Note */
          .bg-amber-50 {
            background-color: #fffbeb !important;
            border-left: 2px solid #f59e0b !important;
            padding: 4px 6px !important;
            margin: 4px 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .bg-amber-50 p {
            font-size: 7px;
            margin: 1px 0;
            line-height: 1.2;
          }
          
          .text-amber-900 {
            color: #78350f !important;
            font-size: 7px;
          }
          
          .text-amber-800 {
            color: #92400e !important;
            font-size: 7px;
          }
          
          /* Background colors for installment rows */
          .bg-blue-50 {
            background-color: #f0f9ff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
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
          
          /* Grid Layout */
          .grid {
            page-break-inside: avoid;
          }
          
          /* Spacing */
          .space-y-6 > * + * {
            margin-top: 1.5rem;
          }
          
          .space-y-2 > * + * {
            margin-top: 0.5rem;
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
  const remainingAfterDeposit = totalAmount - initialDeposit
  const installmentAmount = remainingAfterDeposit / termMonths
  const schedule = []
  
  const firstDueDate = nextDueDate ? new Date(nextDueDate) : new Date(startDate)
  
  for (let i = 0; i < termMonths; i++) {
    const dueDate = new Date(firstDueDate)
    dueDate.setMonth(dueDate.getMonth() + i)
    
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
