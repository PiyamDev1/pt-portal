import type {
  TicketingCreateVoucherInput,
  TicketingCreateVoucherResult,
  TicketingAppendVoucherEventInput,
  TicketingVoucherEventItem,
  TicketingVoucherEventResult,
  TicketingVoucherPage,
  TicketingVoucherStatus,
} from '@/lib/ticketing/voucherContracts'

type ErrorPayload = { error?: string }

export class TicketVoucherApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TicketVoucherApiError'
  }
}

export async function loadTicketVouchers(
  filters: { pnr: string; status: TicketingVoucherStatus | '' },
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<TicketingVoucherPage> {
  const search = new URLSearchParams({ limit: '50' })
  const pnr = filters.pnr.trim().toUpperCase().replace(/\s+/g, '')
  if (pnr) search.set('pnr', pnr)
  if (filters.status) search.set('status', filters.status)
  if (options.cursor) search.set('cursor', options.cursor)

  const response = await fetch(`/api/ticketing/vouchers?${search.toString()}`, {
    cache: 'no-store',
    signal: options.signal,
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<TicketingVoucherPage> &
    ErrorPayload
  if (!response.ok) {
    throw new TicketVoucherApiError(payload.error || 'Unable to load Ticket Vouchers.')
  }
  if (
    !Array.isArray(payload.items) ||
    !('nextCursor' in payload) ||
    typeof payload.context?.canManage !== 'boolean'
  ) {
    throw new TicketVoucherApiError('Ticket Vouchers returned an invalid response.')
  }
  return {
    items: payload.items,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    context: payload.context,
  }
}

export async function createTicketVoucher(
  input: TicketingCreateVoucherInput,
  idempotencyKey: string,
): Promise<TicketingCreateVoucherResult> {
  const response = await fetch('/api/ticketing/vouchers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as Partial<TicketingCreateVoucherResult> & ErrorPayload
  if (!response.ok) {
    throw new TicketVoucherApiError(payload.error || 'Unable to create the Ticket Voucher.')
  }
  if (
    typeof payload.voucherId !== 'string' ||
    typeof payload.bookingId !== 'string' ||
    payload.status !== 'unclaimed' ||
    typeof payload.claimByDate !== 'string' ||
    typeof payload.idempotentReplay !== 'boolean'
  ) {
    throw new TicketVoucherApiError('Ticket Voucher creation returned an invalid response.')
  }
  return payload as TicketingCreateVoucherResult
}

export async function loadTicketVoucherEvents(
  voucherId: string,
  signal?: AbortSignal,
): Promise<TicketingVoucherEventItem[]> {
  const response = await fetch(`/api/ticketing/vouchers/${encodeURIComponent(voucherId)}/events`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    items?: TicketingVoucherEventItem[]
    error?: string
  }
  if (!response.ok) {
    throw new TicketVoucherApiError(payload.error || 'Unable to load Ticket Voucher history.')
  }
  if (!Array.isArray(payload.items)) {
    throw new TicketVoucherApiError('Ticket Voucher history returned an invalid response.')
  }
  return payload.items
}

export async function appendTicketVoucherEvent(
  voucherId: string,
  input: TicketingAppendVoucherEventInput,
  idempotencyKey: string,
): Promise<TicketingVoucherEventResult> {
  const response = await fetch(`/api/ticketing/vouchers/${encodeURIComponent(voucherId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as Partial<TicketingVoucherEventResult> & ErrorPayload
  if (!response.ok) {
    throw new TicketVoucherApiError(payload.error || 'Unable to update this Ticket Voucher.')
  }
  if (
    typeof payload.voucherId !== 'string' ||
    typeof payload.eventId !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.version !== 'number' ||
    typeof payload.idempotentReplay !== 'boolean'
  ) {
    throw new TicketVoucherApiError('Ticket Voucher update returned an invalid response.')
  }
  return payload as TicketingVoucherEventResult
}
