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
    if (filter.type && tx.transaction_type !== filter.type) return false
    if (filter.dateFrom && new Date(tx.transaction_timestamp) < new Date(filter.dateFrom)) return false
    if (filter.dateTo && new Date(tx.transaction_timestamp) > new Date(filter.dateTo)) return false
    return true
  }) || []

  // Calculate totals
  const totals = {
    debits: filteredTransactions.filter((tx: any) => tx.transaction_type === 'Service' || tx.transaction_type === 'Fee').reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0),
    credits: filteredTransactions.filter((tx: any) => tx.transaction_type === 'Payment').reduce((sum: number, tx: any) => sum + parseFloat(tx.amount), 0)
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
        <div className="border-b-2 border-slate-900 pb-4">
          <h2 className="text-2xl font-bold text-slate-900">Your Company Name</h2>
          <p className="text-slate-600">Address | Phone | Email</p>
          <p className="text-xs text-slate-400 mt-2">Document Reference: STM-{account.id.substring(0, 8).toUpperCase()}</p>
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
                <option value="Service">Debt Added</option>
                <option value="Payment">Payment</option>
                <option value="Fee">Fee</option>
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

        {/* Transaction Table */}
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
                filteredTransactions.map((tx: any, i: number) => {
                  const isDebit = tx.transaction_type === 'Service' || tx.transaction_type === 'Fee'
                  const txAmount = parseFloat(tx.amount) || 0
                  
                  return (
                    <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="p-3 text-slate-600">{new Date(tx.transaction_timestamp).toLocaleDateString()}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          tx.transaction_type === 'Service' ? 'bg-blue-50 text-blue-700' :
                          tx.transaction_type === 'Payment' ? 'bg-green-50 text-green-700' :
                          'bg-slate-50 text-slate-700'
                        }`}>
                          {tx.transaction_type}
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
                        {tx.transaction_type === 'Payment' ? `£${txAmount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  )
                })
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

        {/* Footer */}
        <div className="border-t pt-6 text-xs text-slate-500 text-center">
          <p>This is a computer-generated statement. No signature is required.</p>
          <p>For questions about this statement, please contact our office.</p>
          <p className="mt-2 print:hidden">Printed on {new Date().toLocaleString()}</p>
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
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
          .max-w-4xl {
            max-width: 100%;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 12px;
            text-align: left;
          }
          th {
            background-color: #f1f5f9;
            font-weight: bold;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
        }
      `}</style>
    </div>
  )
}

function generateCSV(transactions: any[]) {
  const headers = ['Date', 'Type', 'Description', 'Debit', 'Credit']
  const rows = transactions.map(tx => [
    new Date(tx.transaction_timestamp).toLocaleDateString(),
    tx.transaction_type,
    tx.remark || '',
    tx.transaction_type === 'Service' || tx.transaction_type === 'Fee' ? parseFloat(tx.amount).toFixed(2) : '',
    tx.transaction_type === 'Payment' ? parseFloat(tx.amount).toFixed(2) : ''
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
