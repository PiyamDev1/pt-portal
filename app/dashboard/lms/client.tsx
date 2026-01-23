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
  const [showTransaction, setShowTransaction] = useState<any>(null)
  const [showStatementPopup, setShowStatementPopup] = useState<any>(null)

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
                onAddTransaction={() => setShowTransaction(account)}
                onShowStatement={() => setShowStatementPopup(account)}
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
      {showTransaction && <TransactionModal data={showTransaction} onClose={() => setShowTransaction(null)} onSave={fetchData} employeeId={currentUserId} />}
      {showStatementPopup && <StatementPopup account={showStatementPopup} onClose={() => setShowStatementPopup(null)} />}
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
function AccountRow({ account, expanded, onToggle, onAddTransaction, onShowStatement, getStatusBadge }: any) {
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
            <button 
              onClick={(e) => { e.stopPropagation(); onShowStatement(account) }}
              className="font-mono text-lg font-bold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
              title="Click to view statement"
            >
              £{(account.total_balance || 0).toLocaleString()}
            </button>
          {account.nextDue && (
            <div className="text-xs text-slate-400">Due: {new Date(account.nextDue).toLocaleDateString()}</div>
          )}
        </td>
        <td className="p-3">
          <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => onAddTransaction({...account, transactionType: 'service'})}
              className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors group"
              title="Add Service"
            >
              <Plus className="w-4 h-4 text-blue-600 group-hover:text-blue-700" />
            </button>
            {account.loans.length > 0 && (
              <button 
                onClick={() => onAddTransaction({...account, transactionType: 'payment'})}
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
            <LedgerView account={account} />
          </td>
        </tr>
      )}
    </>
  )
}

// Inline Ledger View
function LedgerView({ account }: any) {
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

// Enhanced New Customer Modal - with optional transaction entry
function NewCustomerModal({ onClose, onSave, employeeId }: any) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' })
  const [addTransaction, setAddTransaction] = useState(false)
  const [txForm, setTxForm] = useState({ amount: '', type: 'service', paymentMethodId: '', notes: '' })
  const [methods, setMethods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/lms/payment-methods').then(r => r.json()).then(d => setMethods(d.methods || []))
  }, [])

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) return toast.error('First and Last name required')
    if (addTransaction && (!txForm.amount || parseFloat(txForm.amount) <= 0)) return toast.error('Valid transaction amount required')
    
    setLoading(true)
    try {
      const res = await fetch('/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'create_customer', 
          ...form, 
          employeeId,
          initialTransaction: addTransaction ? txForm : null
        })
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer Details */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Customer Information</h4>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="First Name *" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="p-3 border rounded-lg" required />
            <input placeholder="Last Name *" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="p-3 border rounded-lg" required />
          </div>
          <input placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full p-3 border rounded-lg mt-3" />
          <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 border rounded-lg mt-3" />
          <input placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full p-3 border rounded-lg mt-3" />
        </div>

        {/* Transaction Checkbox */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg cursor-pointer" onClick={() => setAddTransaction(!addTransaction)}>
          <input type="checkbox" checked={addTransaction} onChange={e => setAddTransaction(e.target.checked)} className="w-4 h-4" />
          <label className="text-sm font-bold text-slate-700 cursor-pointer">Add Initial Transaction</label>
        </div>

        {/* Conditional Transaction Section */}
        {addTransaction && (
          <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-xs font-bold text-blue-700 uppercase">Initial Transaction</h4>
            
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Transaction Type</label>
              <select value={txForm.type} onChange={e => setTxForm({...txForm, type: e.target.value})} className="w-full p-3 border rounded-lg bg-white">
                <option value="service">Debt Added (Service)</option>
                <option value="payment">Payment Made</option>
                <option value="fee">Fee</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00" 
                  value={txForm.amount} 
                  onChange={e => setTxForm({...txForm, amount: e.target.value})} 
                  className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
                />
              </div>
            </div>

            {txForm.type === 'payment' && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Payment Method</label>
                <select value={txForm.paymentMethodId} onChange={e => setTxForm({...txForm, paymentMethodId: e.target.value})} className="w-full p-3 border rounded-lg bg-white">
                  <option value="">Select method...</option>
                  {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            <textarea placeholder="Notes (optional)" value={txForm.notes} onChange={e => setTxForm({...txForm, notes: e.target.value})} className="w-full p-3 border rounded-lg" rows={2} />
          </div>
        )}

        <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Customer'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// Unified Transaction Modal - handles Service, Payment, and Fee transactions
function TransactionModal({ data, onClose, onSave, employeeId }: any) {
  const [form, setForm] = useState({ 
    type: data.transactionType || 'service', 
    amount: '', 
    paymentMethodId: '',
    termMonths: '12',
    firstDueDate: new Date().toISOString().split('T')[0],
    notes: '' 
  })
  const [methods, setMethods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/lms/payment-methods').then(r => r.json()).then(d => setMethods(d.methods || []))
  }, [])

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Valid amount required')
    
    const payload: any = { 
      amount: form.amount,
      customerId: data.id,
      notes: form.notes,
      employeeId 
    }

    // Route to appropriate action based on type
    if (form.type === 'service') {
      payload.action = 'add_service'
      payload.serviceAmount = form.amount
      payload.termMonths = form.termMonths
      payload.firstDueDate = form.firstDueDate
    } else if (form.type === 'payment') {
      payload.action = 'record_payment'
      payload.loanId = data.loans[0]?.id // Use first loan with balance
      payload.paymentMethodId = form.paymentMethodId
    } else if (form.type === 'fee') {
      payload.action = 'add_fee'
      // Add fee logic similar to service
    }

    setLoading(true)
    try {
      const res = await fetch('/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed')
      
      const actionLabel = form.type === 'service' ? 'Service added' : form.type === 'payment' ? 'Payment recorded' : 'Fee added'
      toast.success(actionLabel + '!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to record transaction')
    } finally {
      setLoading(false)
    }
  }

  const isPayment = form.type === 'payment'
  const isService = form.type === 'service'
  const isFee = form.type === 'fee'

  return (
    <ModalWrapper onClose={onClose} title={`Record ${form.type === 'service' ? 'Service' : form.type === 'payment' ? 'Payment' : 'Fee'} - ${data.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Transaction Type Selector */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Transaction Type</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setForm({...form, type: 'service'})}
              className={`p-2 rounded-lg text-xs font-bold transition-all ${form.type === 'service' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Debt Added
            </button>
            <button
              type="button"
              onClick={() => setForm({...form, type: 'payment'})}
              className={`p-2 rounded-lg text-xs font-bold transition-all ${form.type === 'payment' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Payment
            </button>
            <button
              type="button"
              onClick={() => setForm({...form, type: 'fee'})}
              className={`p-2 rounded-lg text-xs font-bold transition-all ${form.type === 'fee' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Fee
            </button>
          </div>
        </div>

        {/* Amount Field */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            {isPayment ? 'Payment Amount' : isService ? 'Service Amount' : 'Fee Amount'}
          </label>
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
          {isPayment && data.loans[0] && (
            <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700 font-semibold">
              Current Balance: £{(data.loans[0].current_balance || 0).toLocaleString()}
            </div>
          )}
        </div>

        {/* Service-Specific Fields */}
        {isService && (
          <>
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
          </>
        )}

        {/* Payment-Specific Fields */}
        {isPayment && (
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Payment Method</label>
            <select value={form.paymentMethodId} onChange={e => setForm({...form, paymentMethodId: e.target.value})} className="w-full p-3 border rounded-lg" required>
              <option value="">Select method...</option>
              {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        {/* Notes Field */}
        <textarea 
          placeholder="Notes (optional)" 
          value={form.notes} 
          onChange={e => setForm({...form, notes: e.target.value})} 
          className="w-full p-3 border rounded-lg" 
          rows={2} 
        />

        <button 
          type="submit" 
          disabled={loading} 
          className={`w-full py-3 rounded-lg font-bold disabled:opacity-50 ${
            isPayment ? 'bg-green-600 hover:bg-green-700 text-white' :
            isService ? 'bg-blue-600 hover:bg-blue-700 text-white' :
            'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          {loading ? 'Recording...' : isPayment ? 'Record Payment' : isService ? 'Add Service' : 'Add Fee'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// Statement Popup - Shows transaction history as bank statement
function StatementPopup({ account, onClose }: any) {
  const [runningBalance, setRunningBalance] = useState(account.total_balance || 0)

  return (
    <ModalWrapper onClose={onClose} title={`Statement - ${account.name}`}>
      <div className="space-y-4">
        {/* Customer Header */}
        <div className="border-b pb-4">
          <h4 className="font-bold text-slate-800">{account.name}</h4>
          <p className="text-sm text-slate-600">Phone: {account.phone || 'N/A'}</p>
          <p className="text-sm text-slate-600">Email: {account.email || 'N/A'}</p>
          <div className="mt-2 p-2 bg-slate-100 rounded">
            <div className="text-xs text-slate-500">Current Balance</div>
            <div className="text-xl font-bold text-slate-900">£{account.total_balance.toLocaleString()}</div>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="max-h-96 overflow-y-auto">
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
              {account.transactions && account.transactions.length > 0 ? (
                account.transactions.map((tx: any, i: number) => {
                  const isDebit = tx.transaction_type === 'Service' || tx.transaction_type === 'Fee'
                  const txAmount = parseFloat(tx.amount) || 0
                  
                  return (
                    <tr key={i} className="border-t border-slate-200 hover:bg-slate-50">
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
                      <td className="p-2 text-slate-600 text-xs">
                        {tx.remark || '-'}
                        {tx.loan_payment_methods?.name && <div className="text-[9px] text-slate-400">({tx.loan_payment_methods.name})</div>}
                      </td>
                      <td className="p-2 text-right font-mono text-red-600">
                        {isDebit ? `£${txAmount.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-2 text-right font-mono text-green-600">
                        {tx.transaction_type === 'Payment' ? `£${txAmount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 pt-4 border-t">
          <div className="flex gap-2">
            <button 
              onClick={() => window.print()}
              className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-lg transition-colors text-sm"
            >
              Print Statement
            </button>
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-lg transition-colors text-sm"
            >
              Close
            </button>
          </div>
          <a 
            href={`/dashboard/lms/statement/${account.id}`}
            target="_blank"
            className="block text-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors text-sm"
          >
            View Full Statement (Printable)
          </a>
        </div>
      </div>
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
