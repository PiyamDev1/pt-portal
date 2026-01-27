'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Plus, Users, Banknote, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'

// Imports from extracted components
import { StatCard } from './components/StatCard'
import { AccountRow } from './components/AccountRow'
import { ModalWrapper } from './components/ModalWrapper'
import { NewCustomerModal } from './components/NewCustomerModal'
import { TransactionModal } from './components/TransactionModal'
import { StatementPopup } from './components/StatementPopup'
import { EditCustomerModal } from './components/EditCustomerModal'
import { ErrorBoundary } from './ErrorBoundary'
import { TableHeaderSkeleton, StatCardSkeleton } from './components/Skeletons'

// Hooks and utilities
import { useDebounce } from './hooks'

// Types and constants
import { Account, LMSData } from './types'
import { FILTER_OPTIONS, STATUS_COLORS, API_ENDPOINTS } from './constants'

interface LMSClientProps {
  currentUserId: string
}

/**
 * LMS Client - Main loan management system component
 * Handles account management, transactions, and statements
 */
export default function LMSClient({ currentUserId }: LMSClientProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LMSData>({ accounts: [], stats: {} })
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [filter, setFilter] = useState('active')

  // Modal states
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [showTransaction, setShowTransaction] = useState<(Account & { transactionType?: string }) | null>(null)
  const [showStatementPopup, setShowStatementPopup] = useState<Account | null>(null)
  const [showEditCustomer, setShowEditCustomer] = useState<Account | null>(null)
  const [reopenStatementFor, setReopenStatementFor] = useState<Account | null>(null)

  // Fetch data
  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`${API_ENDPOINTS.LMS}?filter=${filter}`)
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        toast.error('Failed to load accounts')
        setLoading(false)
      })
  }, [filter])

  useEffect(() => {
    fetchData()
  }, [filter, fetchData])

  // Keep statement modal in sync with latest data
  useEffect(() => {
    if (showStatementPopup) {
      const updated = data.accounts?.find((a: Account) => a.id === showStatementPopup.id)
      if (updated) setShowStatementPopup(updated)
    }
  }, [data.accounts, showStatementPopup])

  // Memoized filtered accounts
  const filtered = useMemo(() => {
    return (
      data.accounts?.filter((a: Account) => 
        a.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        a.phone?.includes(debouncedSearchTerm) ||
        a.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      ) || []
    )
  }, [data.accounts, debouncedSearchTerm])

  // Status badge with memoization
  const getStatusBadge = useCallback((account: Account) => {
    if (account.balance <= 0) {
      return (
        <span className={`px-2 py-0.5 bg-${STATUS_COLORS.SETTLED.bg} ${STATUS_COLORS.SETTLED.text} text-[10px] font-bold rounded border ${STATUS_COLORS.SETTLED.border}`}>
          SETTLED
        </span>
      )
    }
    if (account.isOverdue) {
      return (
        <span className={`px-2 py-0.5 bg-${STATUS_COLORS.OVERDUE.bg} ${STATUS_COLORS.OVERDUE.text} text-[10px] font-bold rounded border ${STATUS_COLORS.OVERDUE.border} flex items-center gap-1 w-fit`}>
          <AlertTriangle className="w-3 h-3" />
          OVERDUE
        </span>
      )
    }
    if (account.isDueSoon) {
      return (
        <span className={`px-2 py-0.5 bg-${STATUS_COLORS.DUE_SOON.bg} ${STATUS_COLORS.DUE_SOON.text} text-[10px] font-bold rounded border ${STATUS_COLORS.DUE_SOON.border} flex items-center gap-1 w-fit`}>
          <Clock className="w-3 h-3" />
          DUE SOON
        </span>
      )
    }
    return (
      <span className={`px-2 py-0.5 bg-${STATUS_COLORS.ACTIVE.bg} ${STATUS_COLORS.ACTIVE.text} text-[10px] font-bold rounded border ${STATUS_COLORS.ACTIVE.border}`}>
        ACTIVE
      </span>
    )
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Skeleton Table Header and Rows */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex gap-2">
            <div className="flex-1 h-10 bg-slate-200 rounded animate-pulse" />
            <div className="w-32 h-10 bg-slate-200 rounded animate-pulse" />
          </div>
          <TableHeaderSkeleton />
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            icon={Banknote}
            label="Outstanding"
            value={`£${data.stats.totalOutstanding?.toLocaleString() || 0}`}
            color="blue"
          />
          <StatCard icon={Users} label="Active" value={data.stats.activeAccounts || 0} color="slate" />
          <StatCard
            icon={AlertTriangle}
            label="Overdue"
            value={data.stats.overdueAccounts || 0}
            color="red"
          />
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
            {FILTER_OPTIONS.map(f => (
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

          <div className="relative flex-1 md:flex-none md:w-80">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>
        </div>

        {/* Accounts Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 text-left text-xs font-bold text-slate-600 uppercase">Customer</th>
                <th className="p-3 text-left text-xs font-bold text-slate-600 uppercase">Contact</th>
                <th className="p-3 text-center text-xs font-bold text-slate-600 uppercase">Status</th>
                <th className="p-3 text-right text-xs font-bold text-slate-600 uppercase">Balance</th>
                <th className="p-3 text-center text-xs font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((account: Account) => (
                <ErrorBoundary key={account.id}>
                  <AccountRow
                    account={account}
                    onAddTransaction={(payload: Account & { transactionType?: string }) =>
                      setShowTransaction(payload)
                    }
                    onShowStatement={(acc) => setShowStatementPopup(acc)}
                    onEdit={() => setShowEditCustomer(account)}
                    getStatusBadge={getStatusBadge}
                  />
                </ErrorBoundary>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    No accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modals */}
        {showNewCustomer && (
          <ErrorBoundary>
            <NewCustomerModal
              onClose={() => setShowNewCustomer(false)}
              onSave={fetchData}
              employeeId={currentUserId}
            />
          </ErrorBoundary>
        )}

        {showTransaction && (
          <ErrorBoundary>
            <TransactionModal
              data={showTransaction}
              onClose={() => setShowTransaction(null)}
              onSave={fetchData}
              employeeId={currentUserId}
              onPaymentRecorded={() => {
                const target = reopenStatementFor || showTransaction
                setShowTransaction(null)
                if (target) setShowStatementPopup(target)
                setReopenStatementFor(null)
              }}
            />
          </ErrorBoundary>
        )}

        {showStatementPopup && (
          <ErrorBoundary>
            <StatementPopup
              account={showStatementPopup}
              onClose={() => setShowStatementPopup(null)}
              onAddPayment={(acc: Account) => {
                setShowStatementPopup(null)
                setReopenStatementFor(acc)
                setShowTransaction({ ...acc, transactionType: 'payment' })
              }}
              onAddDebt={(acc: Account) => {
                setShowStatementPopup(null)
                setShowTransaction({ ...acc, transactionType: 'fee' })
              }}
              onRefresh={fetchData}
            />
          </ErrorBoundary>
        )}

        {showEditCustomer && (
          <ErrorBoundary>
            <EditCustomerModal
              customer={showEditCustomer}
              onClose={() => setShowEditCustomer(null)}
              onSave={fetchData}
              employeeId={currentUserId}
            />
          </ErrorBoundary>
        )}
      </div>
    </ErrorBoundary>
  )
}
