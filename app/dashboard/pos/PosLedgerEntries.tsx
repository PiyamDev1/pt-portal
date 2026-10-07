'use client'

import { Fragment } from 'react'
import { Banknote, ChevronRight, CreditCard, Landmark } from 'lucide-react'
import type { PosLedgerPeriod, PosLedgerTransaction } from '@/lib/pos/contracts'
import { formatMoney, formatSignedMoney } from '@/lib/pos/format'

type PosLedgerEntry = Pick<
  PosLedgerTransaction,
  'id' | 'date' | 'time' | 'name' | 'category' | 'method' | 'amount' | 'points' | 'status'
> &
  Partial<Pick<PosLedgerTransaction, 'reference' | 'supplier'>>

export function formatPosLedgerDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: includeYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function statusTone(status: string) {
  if (status === 'Posted') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
  if (status === 'Pending') return 'bg-amber-50 text-amber-700 ring-amber-600/10'
  if (status === 'Supplier payment') return 'bg-blue-50 text-blue-700 ring-blue-600/10'
  if (status === 'Transfer') return 'bg-yellow-50 text-yellow-800 ring-yellow-600/10'
  return 'bg-slate-100 text-slate-700 ring-slate-600/10'
}

export default function PosLedgerEntries({
  transactions,
  period,
  selectedTransactionId,
  height,
  onSelect,
}: {
  transactions: PosLedgerEntry[]
  period: PosLedgerPeriod
  selectedTransactionId: string
  height: number
  onSelect: (transactionId: string) => void
}) {
  const dateSummaries = new Map<string, { count: number; net: number }>()
  if (period === 'month') {
    for (const transaction of transactions) {
      const summary = dateSummaries.get(transaction.date) ?? { count: 0, net: 0 }
      summary.count += 1
      summary.net += transaction.amount
      dateSummaries.set(transaction.date, summary)
    }
  }

  return (
    <>
      <div data-pos-tour="ledger-rows" className="hidden overflow-auto md:block" style={{ height }}>
        <table
          aria-label="POS ledger transactions"
          className="w-full min-w-[780px] border-collapse text-left"
        >
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
            <tr className="border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              <th className="px-3 py-2">Time / reference</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Name / category</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2 text-right">In</th>
              <th className="px-3 py-2 text-right">Out</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2">Status</th>
              <th className="w-9 px-2 py-2">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((transaction, index) => {
              const startsDateGroup =
                period === 'month' &&
                (index === 0 || transactions[index - 1].date !== transaction.date)
              const dateSummary = dateSummaries.get(transaction.date)

              return (
                <Fragment key={transaction.id}>
                  {startsDateGroup && dateSummary && (
                    <tr>
                      <td colSpan={9} className="border-y-4 border-white bg-slate-100 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-black text-slate-800">
                            {formatPosLedgerDate(transaction.date)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {dateSummary.count} entries · net {formatSignedMoney(dateSummary.net)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr
                    onClick={() => onSelect(transaction.id)}
                    className={`cursor-pointer transition hover:bg-slate-50 ${
                      selectedTransactionId === transaction.id ? 'bg-red-50/50' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <p className="text-xs font-black text-slate-900">{transaction.time}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        {transaction.reference || transaction.id}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {transaction.supplier ? (
                        <span className="inline-flex rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-bold text-blue-700">
                          {transaction.supplier}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs font-bold text-slate-900">{transaction.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{transaction.category}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        {transaction.method === 'Cash' ? (
                          <Banknote className="h-3.5 w-3.5" />
                        ) : transaction.method === 'Card' ? (
                          <CreditCard className="h-3.5 w-3.5" />
                        ) : (
                          <Landmark className="h-3.5 w-3.5" />
                        )}
                        {transaction.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-black text-emerald-700">
                      {transaction.amount > 0 ? formatMoney(transaction.amount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-black text-rose-700">
                      {transaction.amount < 0 ? formatMoney(transaction.amount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-black text-violet-700">
                      {transaction.points === 0
                        ? '—'
                        : `${transaction.points > 0 ? '+' : ''}${transaction.points}`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusTone(transaction.status)}`}
                      >
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-400">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 overflow-y-auto md:hidden" style={{ height }}>
        {transactions.map((transaction, index) => {
          const startsDateGroup =
            period === 'month' && (index === 0 || transactions[index - 1].date !== transaction.date)

          return (
            <Fragment key={transaction.id}>
              {startsDateGroup && (
                <div className="border-y-4 border-white bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-800">
                  {formatPosLedgerDate(transaction.date)}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(transaction.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black text-slate-900">{transaction.name}</p>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {transaction.time}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{transaction.category}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-black ${transaction.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}
                  >
                    {transaction.amount < 0 ? '−' : '+'}
                    {formatMoney(transaction.amount)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    {transaction.method}
                    {transaction.points !== 0
                      ? ` · ${transaction.points > 0 ? '+' : ''}${transaction.points} pts`
                      : ''}
                  </p>
                </div>
              </button>
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
