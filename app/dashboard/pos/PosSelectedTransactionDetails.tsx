import { Pencil, X } from 'lucide-react'

import type { PosLedgerTransaction } from '@/lib/pos/contracts'
import { formatMoney } from '@/lib/pos/format'

type SelectedTransaction = Pick<
  PosLedgerTransaction,
  'id' | 'name' | 'category' | 'method' | 'amount' | 'points'
> &
  Partial<
    Pick<
      PosLedgerTransaction,
      | 'reference'
      | 'outgoingType'
      | 'isLegacy'
      | 'tenders'
      | 'sourceLinks'
      | 'refundableRemaining'
      | 'refunds'
      | 'auditEvents'
    >
  >

type PosSelectedTransactionDetailsProps = {
  transaction: SelectedTransaction
  canManage: boolean
  onCorrect: () => void
  onRefund: () => void
  onReceipt: () => void
  onClose: () => void
}

export default function PosSelectedTransactionDetails({
  transaction,
  canManage,
  onCorrect,
  onRefund,
  onReceipt,
  onClose,
}: PosSelectedTransactionDetailsProps) {
  return (
    <section
      data-pos-tour="transaction-details"
      className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Expanded transaction
            </p>
            <h2 className="text-xs font-black text-slate-950">
              {transaction.reference || transaction.id}
            </h2>
          </div>
          <span className="hidden h-7 w-px bg-slate-200 sm:block" />
          <p className="truncate text-xs text-slate-600">
            <span className="font-black text-slate-900">{transaction.name}</span>
            {' · '}
            {transaction.category}
            {' · '}
            {transaction.method} {formatMoney(transaction.amount)}
            {' · '}
            {transaction.points === 0
              ? 'No loyalty'
              : `${transaction.points > 0 ? '+' : ''}${transaction.points} pts`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {transaction.outgoingType === 'EXPENSE' && canManage && (
            <button
              type="button"
              onClick={onCorrect}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Correct
            </button>
          )}
          <button
            type="button"
            onClick={onRefund}
            className="h-8 rounded-lg bg-[#8b1e2d] px-2.5 text-[11px] font-black text-white hover:bg-[#6f1422]"
          >
            Refund
          </button>
          <button
            type="button"
            onClick={onReceipt}
            className="hidden h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 sm:block"
          >
            Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
            aria-label="Close transaction details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-600 sm:grid-cols-4">
        <div>
          <b className="text-slate-900">Tenders</b>
          {(transaction.tenders || []).map((tender) => (
            <p key={tender.id || `${tender.method}:${tender.amount}`}>
              {tender.method} {formatMoney(tender.amount)} · {tender.reconciliationStatus}
              {tender.destination === 'SUPPLIER_DIRECT' ? ' · Provider direct' : ''}
            </p>
          ))}
        </div>
        <div>
          <b className="text-slate-900">Source links</b>
          {(transaction.sourceLinks || []).map((source) => (
            <p key={source.id}>
              {source.sourceType} · {source.displayReference || source.recordId}
            </p>
          ))}
          {!transaction.sourceLinks?.length && <p>None</p>}
        </div>
        <div>
          <b className="text-slate-900">Refunds</b>
          <p>{formatMoney(transaction.refundableRemaining || 0)} refundable</p>
          {(transaction.refunds || []).map((refund) => (
            <p key={refund.id}>
              {refund.reference} · {formatMoney(refund.amount)}
            </p>
          ))}
        </div>
        <div>
          <b className="text-slate-900">Audit</b>
          {(transaction.auditEvents || []).slice(0, 3).map((event) => (
            <p key={event.id}>
              {event.eventType} · {event.actor}
            </p>
          ))}
          {!transaction.auditEvents?.length && <p>Immutable source row</p>}
        </div>
      </div>
    </section>
  )
}
