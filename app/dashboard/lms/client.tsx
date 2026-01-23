'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Users, Banknote, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import NewLoanModal from './components/NewLoanModal'

export default function LMSClient({ currentUserId }: any) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>({ customers: [], stats: {} })
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchDashboard = () => {
    fetch('/api/lms/dashboard')
      .then(res => res.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
  }

  useEffect(() => { fetchDashboard() }, [])

  const filtered = data.customers?.filter((c: any) => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone?.includes(searchTerm)
  ) || []

  if (loading) return <div className="p-12 text-center text-slate-400">Loading Accounts...</div>

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <div className="text-xs text-slate-500 font-bold uppercase">Total Outstanding</div>
                <div className="text-2xl font-black text-slate-800">£{data.stats.totalReceivables?.toLocaleString()}</div>
            </div>
            <Banknote className="w-8 h-8 text-blue-200" />
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <div className="text-xs text-slate-500 font-bold uppercase">Active Borrowers</div>
                <div className="text-2xl font-black text-slate-800">{data.stats.activeCustomers}</div>
            </div>
            <Users className="w-8 h-8 text-slate-200" />
        </div>
        <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
             <button onClick={() => setIsModalOpen(true)} className="w-full h-full flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-lg group transition-colors">
                <Plus className="w-6 h-6 text-slate-400 group-hover:text-blue-600 mb-1" />
                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-700">Add New Account</span>
             </button>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-700">Customer Accounts</h3>
            <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                    placeholder="Search name or phone..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
            </div>
        </div>
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
                <tr>
                    <th className="p-4 pl-6">Customer Name</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Active Services</th>
                    <th className="p-4">Total Balance</th>
                    <th className="p-4 text-right pr-6">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {filtered.map((cust: any) => (
                    <tr key={cust.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/lms/manage/${cust.id}`)}>
                        <td className="p-4 pl-6 font-bold text-slate-700">{cust.name}</td>
                        <td className="p-4 text-sm text-slate-500 font-mono">{cust.phone || '-'}</td>
                        <td className="p-4 text-sm text-slate-500">{cust.activeLoans} Services</td>
                        <td className="p-4 text-base font-bold text-red-600 font-mono">£{cust.totalBalance.toLocaleString()}</td>
                        <td className="p-4 text-right pr-6">
                            <button className="text-slate-400 hover:text-blue-600 p-2 hover:bg-white rounded-full border border-transparent hover:border-slate-200 shadow-sm">
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </td>
                    </tr>
                ))}
                {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-12 text-center text-slate-400">No active accounts found.</td></tr>
                )}
            </tbody>
        </table>
      </div>

      <NewLoanModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={fetchDashboard}
        currentUserId={currentUserId}
      />
    </div>
  )
}
