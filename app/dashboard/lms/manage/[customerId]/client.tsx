'use client'

import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import NewLoanModal from '../../components/NewLoanModal'

export default function LedgerClient({ customerId, currentUserId }: any) {
  const [data, setData] = useState<any>({ customer: {}, ledger: [], balance: 0 })
  const [loading, setLoading] = useState(true)
  const [showServiceModal, setShowServiceModal] = useState(false)

  const fetchLedger = () => {
    fetch(`/api/lms/ledger?customerId=${customerId}`)
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
  }

  useEffect(() => { fetchLedger() }, [customerId])

  if (loading) return <div className="p-12 text-center text-slate-400">Loading Ledger...</div>

  return (
    <div className="space-y-6">
      
      {/* Header Profile */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">{data.customer.first_name} {data.customer.last_name}</h1>
            <p className="text-slate-500 font-mono text-sm">{data.customer.phone_number}</p>
            <p className="text-slate-400 text-xs mt-1">{data.customer.address}</p>
        </div>
        <div className="text-right">
            <div className="text-xs text-slate-500 uppercase font-bold mb-1">Current Balance</div>
            <div className={`text-4xl font-black ${data.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                £{data.balance?.toLocaleString()}
            </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex gap-3">
        <button 
            onClick={() => setShowServiceModal(true)}
            className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black flex items-center justify-center gap-2"
        >
            <Plus className="w-4 h-4" /> Add New Service (Debit)
        </button>
        <button 
            className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 flex items-center justify-center gap-2"
            onClick={() => alert("We need to implement a 'Record Payment' Modal next!")}
        >
            <Receipt className="w-4 h-4" /> Record Payment (Credit)
        </button>
      </div>

      {/* Statement Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
                <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-right text-red-600">Debit (+)</th>
                    <th className="p-4 text-right text-green-600">Credit (-)</th>
                    <th className="p-4 text-right">Balance</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {data.ledger.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-sm text-slate-600">
                            {new Date(item.date).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                            <div className="flex items-center gap-2">
                                {item.isDebit ? <ArrowUpRight className="w-4 h-4 text-red-400"/> : <ArrowDownLeft className="w-4 h-4 text-green-400"/>}
                                <span className="font-medium text-slate-700">{item.description}</span>
                            </div>
                        </td>
                        <td className="p-4 text-right font-mono text-slate-600">
                            {item.isDebit ? `£${item.amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-4 text-right font-mono text-slate-600">
                            {!item.isDebit ? `£${item.amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-slate-800">
                            £{item.balance.toFixed(2)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      <NewLoanModal 
        isOpen={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        onSave={fetchLedger}
        currentUserId={currentUserId}
      />
    </div>
  )
}
