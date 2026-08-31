import type {
  CorrectTicketAttributionInput,
  CreateTicketServiceInput,
  CreateTkTicketInput,
  DuplicateTkRecord,
  MarkTicketServicePaidInput,
  TicketCompletionDetail,
  TicketCompletionContext,
  TicketCompletionLoadResult,
  TicketCompletionUpdate,
  TicketChangeRequest,
  TicketChangeRequestType,
  TicketLedgerPayload,
  TicketServiceBookingLookupResult,
  TicketServiceBookingOption,
} from './types'

type ApiErrorPayload = {
  error?: string
  code?: string
  existing?: DuplicateTkRecord
  fieldErrors?: Record<string, string>
}

export class TicketLedgerApiError extends Error {
  fieldErrors: Record<string, string>
  code?: string

  constructor(message: string, fieldErrors: Record<string, string> = {}, code?: string) {
    super(message)
    this.name = 'TicketLedgerApiError'
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

export async function loadTicketLedger(
  options: { search?: string; cursor?: string } = {},
): Promise<TicketLedgerPayload> {
  const search = new URLSearchParams({ limit: '100' })
  if (options.search?.trim()) search.set('search', options.search.trim())
  if (options.cursor) search.set('cursor', options.cursor)
  const response = await fetch(`/api/ticketing/ledger?${search.toString()}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => ({}))) as TicketLedgerPayload & ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to load your sales ledger')
  }

  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    airlines: Array.isArray(payload.airlines) ? payload.airlines : [],
    context: payload.context,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
  }
}

export type CreateTkTicketResult =
  | { kind: 'created'; pricingSource?: 'unpriced_held' | 'ticketing_ledger' | 'package_quote' }
  | { kind: 'duplicate'; existing: DuplicateTkRecord }

export async function createTkTicket(
  input: CreateTkTicketInput,
  idempotencyKey: string,
): Promise<CreateTkTicketResult> {
  const response = await fetch('/api/ticketing/ledger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & {
    pricingSource?: 'unpriced_held' | 'ticketing_ledger' | 'package_quote'
  }

  if (response.status === 409 && payload.code === 'DUPLICATE_TK' && payload.existing?.pnr) {
    return { kind: 'duplicate', existing: payload.existing }
  }

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to save the ticket',
      payload.fieldErrors,
      payload.code,
    )
  }

  return { kind: 'created', pricingSource: payload.pricingSource }
}

export async function correctTicketAttribution(
  bookingId: string,
  input: CorrectTicketAttributionInput,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(
    `/api/ticketing/ledger/${encodeURIComponent(bookingId)}/attribution`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to correct the ticket attribution',
      payload.fieldErrors,
      payload.code,
    )
  }
}

export async function archiveTicketBooking(
  bookingId: string,
  verificationCode: string,
): Promise<void> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}/archive`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verificationCode, verificationMethod: 'auto' }),
  })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to archive the ticket')
  }
}

export async function requestTicketChange(
  bookingId: string,
  requestType: TicketChangeRequestType,
  requestNotes: string | null,
): Promise<void> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType, requestNotes }),
  })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to submit the change request')
  }
}

export async function loadTicketChangeRequests(): Promise<TicketChangeRequest[]> {
  const response = await fetch('/api/ticketing/requests', { cache: 'no-store' })
  const payload = (await response.json().catch(() => ({}))) as {
    items?: TicketChangeRequest[]
  } & ApiErrorPayload
  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to load ticket change requests')
  }
  return Array.isArray(payload.items) ? payload.items : []
}

export async function reviewTicketChangeRequest(
  requestId: string,
  status: 'fulfilled' | 'rejected',
): Promise<void> {
  const response = await fetch(`/api/ticketing/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to update the change request')
  }
}

export async function lookupIssuedTicketBookings(
  pnr: string,
  signal?: AbortSignal,
  cursor?: string,
): Promise<TicketServiceBookingLookupResult> {
  const search = new URLSearchParams({ pnr })
  if (cursor) search.set('cursor', cursor)
  const response = await fetch(`/api/ticketing/bookings?${search.toString()}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    items?: TicketServiceBookingOption[]
    hasMore?: boolean
    nextCursor?: string | null
  } & ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to find that ticket in your ledger',
      payload.fieldErrors,
      payload.code,
    )
  }

  if (
    !Array.isArray(payload.items) ||
    typeof payload.hasMore !== 'boolean' ||
    (payload.hasMore && (typeof payload.nextCursor !== 'string' || !payload.nextCursor)) ||
    (!payload.hasMore && payload.nextCursor !== null)
  ) {
    throw new TicketLedgerApiError('Ticket lookup returned an invalid result. Try again.')
  }

  return {
    items: payload.items,
    hasMore: payload.hasMore,
    nextCursor: payload.hasMore ? (payload.nextCursor as string) : null,
  }
}

export async function createTicketServiceTransaction(
  bookingId: string,
  input: CreateTicketServiceInput,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(
    `/api/ticketing/bookings/${encodeURIComponent(bookingId)}/transactions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to save the ticket service',
      payload.fieldErrors,
      payload.code,
    )
  }
}

export async function markTicketServicePaid(
  bookingId: string,
  transactionId: string,
  input: MarkTicketServicePaidInput,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(
    `/api/ticketing/bookings/${encodeURIComponent(bookingId)}/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to mark the service as paid',
      payload.fieldErrors,
      payload.code,
    )
  }
}

export async function loadTicketCompletionDetail(
  bookingId: string,
  signal?: AbortSignal,
): Promise<TicketCompletionLoadResult> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: TicketCompletionDetail
    completionContext?: TicketCompletionContext
  } & ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to load the ticket details',
      payload.fieldErrors,
      payload.code,
    )
  }

  if (
    !payload.detail ||
    !payload.completionContext ||
    typeof payload.completionContext.isOnBehalf !== 'boolean' ||
    typeof payload.completionContext.onBehalfReasonRequired !== 'boolean' ||
    typeof payload.completionContext.canManageRecords !== 'boolean' ||
    typeof payload.completionContext.ownerEmployee?.id !== 'string' ||
    typeof payload.completionContext.ownerEmployee?.fullName !== 'string'
  ) {
    throw new TicketLedgerApiError('Ticket details returned an invalid completion context.')
  }

  return {
    detail: payload.detail,
    completionContext: payload.completionContext,
  }
}

export async function updateTicketCompletionDetail(
  bookingId: string,
  input: TicketCompletionUpdate,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to save the ticket details',
      payload.fieldErrors,
      payload.code,
    )
  }
}
