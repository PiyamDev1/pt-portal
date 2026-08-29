'use client'

import { useCallback, useEffect, useState } from 'react'
import { FilePenLine, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  loadTicketChangeRequests,
  reviewTicketChangeRequest,
  TicketLedgerApiError,
} from './ledgerClientApi'
import type { TicketChangeRequest } from './types'

export function TicketChangeRequestsPanel({
  refreshToken,
  onAmend,
  onDelete,
}: {
  refreshToken: number
  onAmend: (request: TicketChangeRequest) => void
  onDelete: (request: TicketChangeRequest) => void
}) {
  const [items, setItems] = useState<TicketChangeRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setItems(await loadTicketChangeRequests())
    } catch (error) {
      toast.error(
        error instanceof TicketLedgerApiError ? error.message : 'Unable to load change requests',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshToken
    void load()
  }, [load, refreshToken])

  const reject = async (requestId: string) => {
    setReviewingId(requestId)
    try {
      await reviewTicketChangeRequest(requestId, 'rejected')
      setItems((current) => current.filter((item) => item.id !== requestId))
      toast.success('Ticket change request rejected')
    } catch (error) {
      toast.error(
        error instanceof TicketLedgerApiError ? error.message : 'Unable to reject request',
      )
    } finally {
      setReviewingId(null)
    }
  }

  if (!isLoading && items.length === 0) return null

  return (
    <section
      className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4"
      aria-label="Pending ticket change requests"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-800">
            Admin queue
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Ticket change requests</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          aria-label="Refresh ticket change requests"
          className="ui-tap ui-focus rounded-xl border border-violet-200 bg-white p-2.5 text-violet-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm font-semibold text-slate-500">Loading requests…</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-violet-100 bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-black text-slate-950">{item.pnr}</p>
                  <p className="truncate text-sm font-bold text-slate-700">{item.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.requestedBy.fullName} requested {item.requestType}
                  </p>
                  {item.requestNotes && (
                    <p className="mt-2 text-sm text-slate-700">{item.requestNotes}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      item.requestType === 'amendment' ? onAmend(item) : onDelete(item)
                    }
                    className="ui-tap ui-focus inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-700 px-3 text-xs font-black text-white"
                  >
                    {item.requestType === 'amendment' ? (
                      <FilePenLine className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {item.requestType === 'amendment' ? 'Amend record' : 'Delete record'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void reject(item.id)}
                    disabled={reviewingId === item.id}
                    className="ui-tap ui-focus inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
