// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketServicePaymentDialog } from '@/app/dashboard/ticketing/ledger/TicketServicePaymentDialog'
import type { TicketLedgerItem } from '@/app/dashboard/ticketing/ledger/types'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMocks }))

const ITEM: TicketLedgerItem = {
  bookingId: '80000000-0000-4000-8000-000000000001',
  transactionId: '82000000-0000-4000-8000-000000000001',
  bookingVersion: 5,
  transactionVersion: 2,
  pnr: 'ABC123',
  customerName: 'Aisha Khan',
  airline: {
    id: '50000000-0000-4000-8000-000000000001',
    iataCode: 'TK',
    name: 'Turkish Airlines',
  },
  serviceType: 'DC',
  operationalStatus: 'issued',
  paymentStatus: 'unpaid',
  bookingDate: '2026-08-23',
  timeLimitAt: null,
  issuedAt: '2026-08-24',
  passengerCount: 2,
  packageMatchStatus: 'unmatched',
  commissionScope: 'ticket',
  detailsStatus: 'recorded',
  fares: [{ passengerType: 'ADT', quantity: 2, unitSupplierCost: 10, unitSalePrice: 30 }],
}

describe('TicketServicePaymentDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('marks only the selected own service transaction paid with optimistic versions', async () => {
    const fetchMock = vi.fn(async () => Response.json({ changed: true }))
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn(async () => undefined)
    const onClose = vi.fn()
    render(
      <TicketServicePaymentDialog
        item={ITEM}
        timezone="Europe/London"
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Paid date for service'), {
      target: { value: '2026-08-23' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/ticketing/bookings/${ITEM.bookingId}/transactions/${ITEM.transactionId}`)
    expect(request?.method).toBe('PATCH')
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    expect(JSON.parse(String(request?.body))).toEqual({
      expectedBookingVersion: 5,
      expectedTransactionVersion: 2,
      paidAt: '2026-08-23',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toastMocks.success).toHaveBeenCalledWith('DC marked as paid')
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()
  })

  it('rejects payment before the service booking date without a request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketServicePaymentDialog
        item={ITEM}
        timezone="Europe/London"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Paid date for service'), {
      target: { value: '2026-08-22' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))

    expect(screen.getByText('Paid date cannot be before the service booking date.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes and closes a stale payment instead of trapping retries on old versions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: 'This service changed after you opened it. Refresh and try again.',
            code: 'VERSION_CONFLICT',
          },
          { status: 409 },
        ),
      ),
    )
    const onClose = vi.fn()
    const onSaved = vi.fn(async () => undefined)
    render(
      <TicketServicePaymentDialog
        item={ITEM}
        timezone="Europe/London"
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Paid date for service'), {
      target: { value: '2026-08-23' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toastMocks.error).toHaveBeenCalledWith(
      'This service changed. Reopen it from the refreshed ledger and review again.',
    )
  })
})
