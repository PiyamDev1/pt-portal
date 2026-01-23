'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, AlertCircle, Banknote, Calendar, ArrowRight, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function LMSClient({ currentUserId }: any) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>({ loans: [], stats: {} })
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetch('/api/lms/dashboard')
      .then(res => {
        if (!res.ok) throw new Error(`API Error: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data.error) {
          console.error("LMS API Error:", data.error)
          setData({ loans: [], stats: { activeCount: 0, totalReceivables: 0, overdueCount: 0 } })
        } else {
          setData(data)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error("LMS Load Error:", err)
        setData({ loans: [], stats: { activeCount: 0, totalReceivables: 0, overdueCount: 0 } })
        setLoading(false)
      })
  }, [])

  // Filter by Customer Name
  const filteredLoans = data.loans?.filter((l: any) => 
    l.loan_customer?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.loan_customer?.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  // RAG Status Logic (Red/Amber/Green)
  const getDueStatus = (dateStr: string, balance: number) => {
    if (balance <= 0) return { color: 'bg-green-100 text-green-700 border-green-200', label: 'Settled' }
    if (!dateStr) return { color: 'bg-slate-100 text-slate-500 border-slate-200', label: 'No Date Set' }
    
    const due = new Date(dateStr)
    const today = new Date()
    // Calculate difference in days
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return { color: 'bg-red-50 text-red-700 border-red-200 font-bold', label: `Overdue ${Math.abs(diffDays)} Days` }
    if (diffDays <= 3) return { color: 'bg-amber-50 text-amber-700 border-amber-200', label: `Due in ${diffDays} Days` }
    return { color: 'bg-blue-50 text-blue-700 border-blue-100', label: due.toLocaleDateString() }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 animate-pulse">
        Loading Loan Portfolio...
    </div>
  )

  // Show error state if no data available
  if (!data.stats || !data.loans) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
      <p className="text-red-700 font-medium">Failed to load LMS data</p>
      <p className="text-red-600 text-sm mt-1">Please check your database configuration or try again later.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      
      {/* 1. Executive Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Total Money Owed */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1 bg-blue-500"/>
            <div>
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Receivables</div>
                <div className="text-3xl font-black text-slate-800 tracking-tight">
                    £{data.stats.totalReceivables?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Banknote className="w-6 h-6" />
            </div>
        </div>

        {/* Card 2: Risk / Overdue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1 bg-red-500"/>
            <div>
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Overdue Accounts</div>
                <div className="text-3xl font-black text-red-600 tracking-tight">
                    {data.stats.overdueCount}
                </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                <AlertCircle className="w-6 h-6" />
            </div>
        </div>

        {/* Card 3: Action Button */}
        <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
             <button 
                onClick={() => router.push('/dashboard/lms/new')}
                className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all group cursor-pointer"
             >
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 group-hover:border-blue-300 group-hover:text-blue-600 transition-colors">
                    <Plus className="w-5 h-5" />
                </div>
                <span className="font-bold text-sm text-slate-600 group-hover:text-blue-700">Issue New Loan</span>
             </button>
        </div>
      </div>

      {/* 2. Active Debt Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-400" /> 
                Active Portfolio
            </h3>
            <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                    placeholder="Search borrowers..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
            </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
                    <tr>
                        <th className="p-4 pl-6">Customer</th>
                        <th className="p-4">Loan Terms</th>
                        <th className="p-4">Outstanding Balance</th>
                        <th className="p-4">Next Payment</th>
                        <th className="p-4 text-right pr-6">Manage</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredLoans.map((loan: any) => {
                        const status = getDueStatus(loan.next_due_date, loan.current_balance)
                        const percentagePaid = 100 - ((loan.current_balance / loan.total_debt_amount) * 100)
                        
                        return (
                            <tr key={loan.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-4 pl-6">
                                    <div className="font-bold text-slate-800 text-sm">
                                        {loan.loan_customer?.first_name} {loan.loan_customer?.last_name}
                                    </div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                                        {loan.loan_customer?.phone_number || 'No Phone'}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="text-xs text-slate-500">
                                        Original: <span className="font-medium text-slate-700">£{loan.total_debt_amount?.toLocaleString()}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                        {loan.term_months} Month Term
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono font-bold text-slate-800 text-base">
                                            £{loan.current_balance?.toLocaleString()}
                                        </span>
                                        {/* Progress Bar */}
                                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${percentagePaid > 90 ? 'bg-green-500' : 'bg-blue-500'}`} 
                                                style={{width: `${percentagePaid}%`}}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${status.color}`}>
                                        {status.label}
                                    </span>
                                </td>
                                <td className="p-4 text-right pr-6">
                                    <button className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-all">
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                    {filteredLoans.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-12 text-center text-slate-400">
                                <div className="flex flex-col items-center gap-2">
                                    <Banknote className="w-8 h-8 text-slate-200" />
                                    <p>No active loans matching your search.</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  )
}
