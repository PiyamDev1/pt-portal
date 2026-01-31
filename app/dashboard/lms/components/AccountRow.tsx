'use client'

import React from 'react'
import { StickyNote, History } from 'lucide-react'
import { Account } from '../types'

interface AccountRowProps {
  account: Account
  onAddTransaction: (payload: Account & { transactionType?: string }) => void
  onShowStatement: (account: Account) => void
  onEdit: () => void
  onShowNotes?: (account: Account) => void
  onShowAuditLogs?: (account: Account) => void
  getStatusBadge: (account: Account) => JSX.Element
}

/**
 * Account Row Component - Table row for displaying account information
 * Memoized to prevent unnecessary re-renders on table updates
 */
export const AccountRow = React.memo(function AccountRow({
  account,
  onAddTransaction,
  onShowStatement,
  onEdit,
  onShowNotes,
  onShowAuditLogs,
  getStatusBadge
}: AccountRowProps) {
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="p-3">
          <div className="font-bold text-slate-800">{account.name}</div>
          <div className="text-xs text-slate-400">
            {account.activeLoans} active loan{account.activeLoans !== 1 && 's'}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm text-slate-600 font-mono">{account.phone || '-'}</div>
          <div className="text-xs text-slate-400">{account.email || '-'}</div>
        </td>
        <td className="p-3 text-center">{getStatusBadge(account)}</td>
        <td className="p-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onShowStatement(account)
            }}
            className="font-mono text-lg font-bold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
            title="Click to view statement"
          >
            £{(account.balance || 0).toLocaleString()}
          </button>
          {account.nextDue && (
            <div className="text-xs text-slate-400">
              Due: {new Date(account.nextDue).toLocaleDateString()}
            </div>
          )}
        </td>
        <td className="p-3">
          <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onShowStatement(account)}
              className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors"
            >
              Statement
            </button>
            <button
              onClick={onEdit}
              className="px-3 py-2 bg-slate-100 text-slate-800 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200"
            >
              Edit
            </button>
            {onShowNotes && (
              <button
                onClick={() => onShowNotes(account)}
                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                title="View Notes"
              >
                <StickyNote className="w-4 h-4" />
              </button>
            )}
            {onShowAuditLogs && (
              <button
                onClick={() => onShowAuditLogs(account)}
                className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
                title="View Audit Trail"
              >
                <History className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  )
})

AccountRow.displayName = 'AccountRow'
