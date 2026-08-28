'use client'

import { useState, type FormEvent } from 'react'
import { Archive, X } from 'lucide-react'
import { toast } from 'sonner'
import { archiveTicketBooking, TicketLedgerApiError } from './ledgerClientApi'
import type { TicketLedgerItem } from './types'

export function TicketArchiveDialog({
  item,
  onClose,
  onArchived,
}: {
  item: TicketLedgerItem
  onClose: () => void
  onArchived: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = reason.trim()
    if (!value) return
    setIsSaving(true)
    try {
      await archiveTicketBooking(item.bookingId, value)
      toast.success(`Ticket ${item.pnr} removed from the active ledger`)
      await onArchived()
      onClose()
    } catch (error) {
      toast.error(
        error instanceof TicketLedgerApiError ? error.message : 'Unable to archive the ticket',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-ticket-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="archive-ticket-title" className="text-lg font-black text-slate-950">
              Delete ticket {item.pnr}?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              This removes the complete booking from the active ledger. Its audit and commission
              correction history will be retained.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close delete ticket dialog"
            className="ui-tap ui-focus rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <label className="mt-4 block text-xs font-bold text-slate-700">
          Reason for deletion
          <textarea
            autoFocus
            required
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSaving}
            placeholder="For example: duplicate entry or incorrect PNR"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="ui-tap ui-focus min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
          >
            Keep ticket
          </button>
          <button
            type="submit"
            disabled={isSaving || !reason.trim()}
            className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Deleting…' : 'Delete ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
