import type { Account } from '../types'

interface StatementHeaderProps {
  account: Account
}

export function StatementHeader({ account }: StatementHeaderProps) {
  return (
    <div className="border-b pb-4">
      <h4 className="font-bold text-slate-800">{account.name}</h4>
      <p className="text-sm text-slate-600">Phone: {account.phone || 'N/A'}</p>
      <p className="text-sm text-slate-600">Email: {account.email || 'N/A'}</p>
      <div className="mt-2 p-2 bg-slate-100 rounded">
        <div className="text-xs text-slate-500">Current Balance</div>
        <div className="text-xl font-bold text-slate-900">
          £{(account.balance || 0).toLocaleString()}
        </div>
      </div>
    </div>
  )
}
