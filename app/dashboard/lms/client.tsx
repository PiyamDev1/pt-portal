'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Users, Banknote, AlertTriangle, Clock, TrendingUp, X, Check, Receipt, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

export default function LMSClient({ currentUserId }: any) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>({ accounts: [], stats: {} })
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('active')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  
  // Modals
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [showAddService, setShowAddService] = useState<any>(null)
  const [showPayment, setShowPayment] = useState<any>(null)

  const fetchData = () => {
    setLoading(true)
    fetch(`/api/lms?filter=${filter}`)
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  useEffect(() => { fetchData() }, [filter])

  const filtered = data.accounts?.filter((a: any) => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.phone?.includes(searchTerm) ||
    a.email?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const getStatusBadge = (account: any) => {
    if (account.balance <= 0) return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200">SETTLED</span>
    if (account.isOverdue) return <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded border border-red-200 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>OVERDUE</span>
    if (account.isDueSoon) return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200 flex items-center gap-1"><Clock className="w-3 h-3"/>DUE SOON</span>
    return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-200">ACTIVE</span>
  }

  if (loading) return <div className="p-12 text-center text-slate-400 animate-pulse">Loading Accounts...</div>

  return (
    <div className="space-y-4">
      
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Banknote} label="Outstanding" value={`£${data.stats.totalOutstanding?.toLocaleString() || 0}`} color="blue" />
        <StatCard icon={Users} label="Active" value={data.stats.activeAccounts || 0} color="slate" />
        <StatCard icon={AlertTriangle} label="Overdue" value={data.stats.overdueAccounts || 0} color="red" />
        <StatCard icon={Clock} label="Due Soon" value={data.stats.dueSoonAccounts || 0} color="amber" />
        <button 
          onClick={() => setShowNewCustomer(true)}
          className="bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-xl p-4 hover:scale-[1.02] transition-all shadow-lg flex flex-col items-center justify-center gap-1 group"
        >
          <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold">New Account</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex gap-2">
          {['active', 'overdue', 'all', 'settled'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                filter === f 
                  ? 'bg-slate-900 text-white shadow' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            placeholder="Search name, phone, email..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
          />
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-[10px] uppercase font-bold text-slate-500">
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Contact</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Balance</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((account: any) => (
              <AccountRow 
                key={account.id} 
                account={account}
                expanded={expandedRow === account.id}
                onToggle={() => setExpandedRow(expandedRow === account.id ? null : account.id)}
                onAddService={() => setShowAddService(account)}
                onAddPayment={(loan) => setShowPayment({ account, loan })}
                getStatusBadge={getStatusBadge}
              />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-12 text-center text-slate-400">No accounts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showNewCustomer && <NewCustomerModal onClose={() => setShowNewCustomer(false)} onSave={fetchData} employeeId={currentUserId} />}
      {showAddService && <AddServiceModal account={showAddService} onClose={() => setShowAddService(null)} onSave={fetchData} employeeId={currentUserId} />}
      {showPayment && <PaymentModal data={showPayment} onClose={() => setShowPayment(null)} onSave={fetchData} employeeId={currentUserId} />}
    </div>
  )
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, color }: any) {
  const colors = {
    blue: 'from-blue-50 to-blue-100 text-blue-700 border-blue-200',
    slate: 'from-slate-50 to-slate-100 text-slate-700 border-slate-200',
    red: 'from-red-50 to-red-100 text-red-700 border-red-200',
    amber: 'from-amber-50 to-amber-100 text-amber-700 border-amber-200'
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-4 border shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase opacity-70">{label}</span>
        <Icon className="w-4 h-4 opacity-50" />
      </div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  )
}

// Account Row with Expandable Ledger
function AccountRow({ account, expanded, onToggle, onAddService, onAddPayment, getStatusBadge }: any) {
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="p-3">
          <div className="font-bold text-slate-800">{account.name}</div>
          <div className="text-xs text-slate-400">{account.activeLoans} active loan{account.activeLoans !== 1 && 's'}</div>
        </td>
        <td className="p-3">
          <div className="text-sm text-slate-600 font-mono">{account.phone || '-'}</div>
          <div className="text-xs text-slate-400">{account.email || '-'}</div>
        </td>
        <td className="p-3 text-center">
          {getStatusBadge(account)}
        </td>
        <td className="p-3 text-right">
          <div className={`text-lg font-black font-mono ${account.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            £{account.balance.toLocaleString()}
          </div>
          {account.nextDue && (
            <div className="text-xs text-slate-400">Due: {new Date(account.nextDue).toLocaleDateString()}</div>
          )}
        </td>
        <td className="p-3">
          <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={onAddService}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors group"
              title="Add Service"
            >
              <Plus className="w-4 h-4 text-slate-600 group-hover:text-slate-900" />
            </button>
            {account.loans.length > 0 && (
              <button 
                onClick={() => onAddPayment(account.loans.find(l => l.current_balance > 0) || account.loans[0])}
                className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors group"
                title="Record Payment"
              >
                <Receipt className="w-4 h-4 text-green-600 group-hover:text-green-700" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-slate-50 p-0">
            <LedgerView account={account} onAddPayment={onAddPayment} />
          </td>
        </tr>
      )}
    </>
  )
}

// Inline Ledger View
function LedgerView({ account, onAddPayment }: any) {
  return (
    <div className="p-4 space-y-3">
      <h4 className="font-bold text-slate-700 text-sm">Transaction History</h4>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right text-red-600">Debit</th>
              <th className="p-2 text-right text-green-600">Credit</th>
            </tr>
          </thead>
          <tbody>
            {account.transactions.map((tx: any, i: number) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="p-2 text-slate-600">
                  {new Date(tx.transaction_timestamp).toLocaleDateString()}
                </td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    tx.transaction_type === 'Service' ? 'bg-blue-50 text-blue-700' :
                    tx.transaction_type === 'Payment' ? 'bg-green-50 text-green-700' :
                    'bg-slate-50 text-slate-700'
                  }`}>
                    {tx.transaction_type}
                  </span>
                </td>
                <td className="p-2 text-slate-600">
                  {tx.remark || '-'}
                  {tx.loan_payment_methods?.name && ` (${tx.loan_payment_methods.name})`}
                </td>
                <td className="p-2 text-right font-mono text-red-600">
                  {tx.transaction_type === 'Service' || tx.transaction_type === 'Fee' ? `£${parseFloat(tx.amount).toFixed(2)}` : '-'}
                </td>
                <td className="p-2 text-right font-mono text-green-600">
                  {tx.transaction_type === 'Payment' ? `£${parseFloat(tx.amount).toFixed(2)}` : '-'}
                </td>
              </tr>
            ))}
            {account.transactions.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-slate-400">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// New Customer Modal
function NewCustomerModal({ onClose, onSave, employeeId }: any) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) return toast.error('First and Last name required')
    
    setLoading(true)
    try {
      const res = await fetch('/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_customer', ...form, employeeId })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Customer created!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to create customer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title="New Customer">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="First Name *" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="p-3 border rounded-lg" required />
          <input placeholder="Last Name *" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="p-3 border rounded-lg" required />
        </div>
        <input placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full p-3 border rounded-lg" />
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 border rounded-lg" />
        <input placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full p-3 border rounded-lg" />
        <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Customer'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// Add Service Modal
function AddServiceModal({ account, onClose, onSave, employeeId }: any) {
  const [form, setForm] = useState({ serviceAmount: '', termMonths: '12', firstDueDate: new Date().toISOString().split('T')[0], notes: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.serviceAmount || parseFloat(form.serviceAmount) <= 0) return toast.error('Valid amount required')
    
    setLoading(true)
    try {
      const res = await fetch('/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'add_service', 
          customerId: account.id,
          ...form,
          employeeId
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Service added!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to add service')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title={`Add Service - ${account.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Service Amount</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input 
              type="number" 
              step="0.01"
              placeholder="0.00" 
              value={form.serviceAmount} 
              onChange={e => setForm({...form, serviceAmount: e.target.value})} 
              className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
              required 
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Term (Months)</label>
            <input type="number" value={form.termMonths} onChange={e => setForm({...form, termMonths: e.target.value})} className="w-full p-3 border rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">First Due Date</label>
            <input type="date" value={form.firstDueDate} onChange={e => setForm({...form, firstDueDate: e.target.value})} className="w-full p-3 border rounded-lg" />
          </div>
        </div>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full p-3 border rounded-lg" rows={2} />
        <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50">
          {loading ? 'Adding...' : 'Add Service'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// Payment Modal
function PaymentModal({ data, onClose, onSave, employeeId }: any) {
  const [form, setForm] = useState({ amount: '', paymentMethodId: '', notes: '' })
  const [methods, setMethods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/lms/payment-methods').then(r => r.json()).then(d => setMethods(d.methods || []))
  }, [])

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Valid amount required')
    
    setLoading(true)
    try {
      const res = await fetch('/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'record_payment',
          loanId: data.loan.id,
          ...form,
          employeeId
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Payment recorded!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title={`Record Payment - ${data.account.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-blue-50 p-3 rounded-lg text-sm">
          <div className="text-blue-600 font-bold">Current Balance: £{data.loan.current_balance.toLocaleString()}</div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Payment Amount</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input 
              type="number" 
              step="0.01"
              placeholder="0.00" 
              value={form.amount} 
              onChange={e => setForm({...form, amount: e.target.value})} 
              className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
              required 
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Payment Method</label>
          <select value={form.paymentMethodId} onChange={e => setForm({...form, paymentMethodId: e.target.value})} className="w-full p-3 border rounded-lg">
            <option value="">Select method...</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full p-3 border rounded-lg" rows={2} />
        <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50">
          {loading ? 'Recording...' : 'Record Payment'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// Modal Wrapper
function ModalWrapper({ children, onClose, title }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}><X className="w-5 h-5 hover:text-slate-300" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
