import type {
  CreateTkTicketInput,
  DuplicateTkRecord,
  TicketCompletionDetail,
  TicketCompletionUpdate,
  TicketLedgerPayload,
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

export async function loadTicketLedger(): Promise<TicketLedgerPayload> {
  const response = await fetch('/api/ticketing/ledger?limit=100', { cache: 'no-store' })
  const payload = (await response.json().catch(() => ({}))) as TicketLedgerPayload & ApiErrorPayload

  if (!response.ok) {
    throw new TicketLedgerApiError(payload.error || 'Unable to load your sales ledger')
  }

  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    airlines: Array.isArray(payload.airlines) ? payload.airlines : [],
    context: payload.context,
  }
}

export type CreateTkTicketResult =
  | { kind: 'created' }
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
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload

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

  return { kind: 'created' }
}

export async function loadTicketCompletionDetail(
  bookingId: string,
  signal?: AbortSignal,
): Promise<TicketCompletionDetail> {
  const response = await fetch(`/api/ticketing/ledger/${encodeURIComponent(bookingId)}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: TicketCompletionDetail
  } & ApiErrorPayload

  if (!response.ok || !payload.detail) {
    throw new TicketLedgerApiError(
      payload.error || 'Unable to load the ticket details',
      payload.fieldErrors,
      payload.code,
    )
  }

  return payload.detail
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
