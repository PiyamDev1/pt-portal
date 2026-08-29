'use client'

import { useState, type FormEvent } from 'react'
import { FilePenLine, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { requestTicketChange, TicketLedgerApiError } from './ledgerClientApi'
import type { TicketChangeRequestType, TicketLedgerItem } from './types'

export function TicketChangeRequestDialog({
  item,
  requestType,
  onClose,
  onRequested,
}: {
  item: Pick<TicketLedgerItem, 'bookingId' | 'pnr'>
  requestType: TicketChangeRequestType
  onClose: () => void
  onRequested: () => Promise<void>
}) {
  const isAmendment = requestType === 'amendment'
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isAmendment && !notes.trim()) return
    setIsSaving(true)
    try {
      await requestTicketChange(item.bookingId, requestType, isAmendment ? notes.trim() : null)
      toast.success(
        isAmendment
          ? 'Amendment request sent to administrators'
          : 'Deletion request sent to administrators',
      )
      await onRequested()
      onClose()
    } catch (error) {
      toast.error(
        error instanceof TicketLedgerApiError ? error.message : 'Unable to submit the request',
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
        aria-labelledby="ticket-change-request-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="ticket-change-request-title" className="text-lg font-black text-slate-950">
              Request {isAmendment ? 'amendment' : 'deletion'} for {item.pnr}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              An administrator will{' '}
              {isAmendment ? 'make the requested corrections' : 'verify and delete the record'}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close request dialog"
            className="ui-tap ui-focus rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {isAmendment ? (
          <label className="mt-4 block text-xs font-bold text-slate-700">
            What needs changing?
            <textarea
              autoFocus
              required
              maxLength={1000}
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isSaving}
              placeholder="Describe the field and the correct value"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            No reason is required. The administrator will authenticate before deleting it.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="ui-tap ui-focus min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || (isAmendment && !notes.trim())}
            className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {isAmendment ? <FilePenLine className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {isSaving ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  )
}
