import type { TicketCompletionDetail, TicketLedgerItem, TicketLedgerPayload } from '../ledger/types'
import type {
  TicketingRecordRefundInput,
  TicketingRecordRefundResult,
  TicketingAppendRefundEventInput,
  TicketingRefundEventResult,
  TicketingRefundPage,
  TicketingRefundStatus,
} from '@/lib/ticketing/refundContracts'

type ErrorPayload = { error?: string }

export class RefundCalculatorLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefundCalculatorLookupError'
  }
}

function normalizedPnr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

async function lookupLedgerTickets(
  pnr: string,
  signal?: AbortSignal,
): Promise<{ normalized: string; items: TicketLedgerItem[] }> {
  const normalized = normalizedPnr(pnr)
  const search = new URLSearchParams({ limit: '100', search: normalized })
  const response = await fetch(`/api/ticketing/ledger?${search.toString()}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as TicketLedgerPayload & ErrorPayload

  if (!response.ok) {
    throw new RefundCalculatorLookupError(
      payload.error || 'Unable to find that ticket in the sales ledger.',
    )
  }

  if (!Array.isArray(payload.items)) {
    throw new RefundCalculatorLookupError('Ticket lookup returned an invalid result. Try again.')
  }

  return { normalized, items: payload.items }
}

export async function lookupRefundCalculatorTickets(
  pnr: string,
  signal?: AbortSignal,
): Promise<TicketLedgerItem[]> {
  const { normalized, items } = await lookupLedgerTickets(pnr, signal)
  return items.filter(
    (item) =>
      normalizedPnr(item.pnr) === normalized &&
      item.serviceType === 'TK' &&
      item.operationalStatus.toLowerCase() === 'issued',
  )
}

export async function lookupReplacementCalculatorTickets(
  pnr: string,
  signal?: AbortSignal,
): Promise<TicketLedgerItem[]> {
  const { normalized, items } = await lookupLedgerTickets(pnr, signal)
  return items.filter(
    (item) =>
      normalizedPnr(item.pnr) === normalized &&
      item.serviceType === 'TK' &&
      ['held', 'issued'].includes(item.operationalStatus.toLowerCase()),
  )
}

export async function loadRefundCalculatorTicketDetail(
  bookingId: string,
  signal?: AbortSignal,
): Promise<TicketCompletionDetail> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: TicketCompletionDetail
    error?: string
  }

  if (!response.ok) {
    throw new RefundCalculatorLookupError(
      payload.error || 'Unable to load that ticket’s passenger details.',
    )
  }
  if (!payload.detail || !Array.isArray(payload.detail.passengers)) {
    throw new RefundCalculatorLookupError(
      'Passenger details returned an invalid result. Try again.',
    )
  }
  return payload.detail
}

export async function saveTicketRefund(
  input: TicketingRecordRefundInput,
  idempotencyKey: string,
): Promise<TicketingRecordRefundResult> {
  const response = await fetch('/api/ticketing/refunds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as Partial<TicketingRecordRefundResult> & ErrorPayload
  if (!response.ok) {
    throw new RefundCalculatorLookupError(payload.error || 'Unable to save this Refund.')
  }
  if (
    typeof payload.refundId !== 'string' ||
    typeof payload.bookingId !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.version !== 'number' ||
    typeof payload.idempotentReplay !== 'boolean'
  ) {
    throw new RefundCalculatorLookupError('Saved Refund returned an invalid response.')
  }
  return payload as TicketingRecordRefundResult
}

export async function loadTicketRefunds(
  filters: { pnr: string; status: TicketingRefundStatus | '' },
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<TicketingRefundPage> {
  const search = new URLSearchParams({ limit: '50' })
  const pnr = normalizedPnr(filters.pnr)
  if (pnr) search.set('pnr', pnr)
  if (filters.status) search.set('status', filters.status)
  if (options.cursor) search.set('cursor', options.cursor)
  const response = await fetch(`/api/ticketing/refunds?${search.toString()}`, {
    cache: 'no-store',
    signal: options.signal,
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<TicketingRefundPage> &
    ErrorPayload
  if (!response.ok) {
    throw new RefundCalculatorLookupError(payload.error || 'Unable to load saved Refunds.')
  }
  if (
    !Array.isArray(payload.items) ||
    !('nextCursor' in payload) ||
    typeof payload.context?.canManage !== 'boolean' ||
    typeof payload.context?.canConfirm !== 'boolean'
  ) {
    throw new RefundCalculatorLookupError('Saved Refunds returned an invalid response.')
  }
  return {
    items: payload.items,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    context: payload.context,
  }
}

export async function appendTicketRefundEvent(
  refundId: string,
  input: TicketingAppendRefundEventInput,
  idempotencyKey: string,
): Promise<TicketingRefundEventResult> {
  const response = await fetch(`/api/ticketing/refunds/${encodeURIComponent(refundId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<TicketingRefundEventResult> &
    ErrorPayload
  if (!response.ok) {
    throw new RefundCalculatorLookupError(payload.error || 'Unable to update this Refund.')
  }
  if (
    typeof payload.refundId !== 'string' ||
    typeof payload.eventId !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.version !== 'number' ||
    typeof payload.idempotentReplay !== 'boolean'
  ) {
    throw new RefundCalculatorLookupError('Refund update returned an invalid response.')
  }
  return payload as TicketingRefundEventResult
}
