// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketCompletionDrawer } from '@/app/dashboard/ticketing/ledger/TicketCompletionDrawer'
import type { TicketCompletionDetail } from '@/app/dashboard/ticketing/ledger/types'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

const DETAIL: TicketCompletionDetail = {
  bookingId: 'booking-1',
  transactionId: 'transaction-1',
  bookingVersion: 3,
  transactionVersion: 5,
  pnr: 'ABC123',
  customerName: 'Aisha Khan',
  contactPhone: null,
  departureDate: null,
  returnDate: null,
  operationalStatus: 'issued',
  paymentStatus: 'unpaid',
  paidAt: null,
  airline: { id: 'airline-tk', iataCode: 'TK', name: 'Turkish Airlines' },
  responsibleEmployee: { id: 'employee-owner', fullName: 'Agent One' },
  detailsStatus: 'needs_details',
  fares: [
    {
      id: 'fare-adult',
      passengerType: 'ADT',
      quantity: 1,
      unitSupplierCost: 450,
      unitSalePrice: null,
      salePriceLocked: false,
    },
    {
      id: 'fare-child',
      passengerType: 'CHD',
      quantity: 1,
      unitSupplierCost: 350,
      unitSalePrice: null,
      salePriceLocked: false,
    },
  ],
  passengers: [],
}

const OWNER_COMPLETION_CONTEXT = {
  ownerEmployee: DETAIL.responsibleEmployee,
  isOnBehalf: false,
  onBehalfReasonRequired: false,
}

const ON_BEHALF_COMPLETION_CONTEXT = {
  ownerEmployee: DETAIL.responsibleEmployee,
  isOnBehalf: true,
  onBehalfReasonRequired: true,
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function completionResponse(
  detail: TicketCompletionDetail = DETAIL,
  completionContext = OWNER_COMPLETION_CONTEXT,
) {
  return jsonResponse({ detail, completionContext })
}

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof TicketCompletionDrawer>> = {},
) {
  const props = {
    bookingId: 'booking-1',
    timezone: 'Europe/London',
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  }
  render(<TicketCompletionDrawer {...props} />)
  return props
}

describe('TicketCompletionDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('lazy-loads the private detail and creates passenger slots from fare quantities', async () => {
    const fetchMock = vi.fn(async () => completionResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderDrawer()

    expect(
      await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' }),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/ticketing/ledger/booking-1', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
    expect((screen.getByLabelText('ADT 1 passenger name') as HTMLInputElement).value).toBe(
      'Aisha Khan',
    )
    expect((screen.getByLabelText('CHD 1 passenger name') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Needs details')).toBeTruthy()
    expect(screen.queryByLabelText('On-behalf completion reason')).toBeNull()
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()
  })

  it('saves contact, journey, grouped sale, payment, and passenger details atomically', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse())
      .mockResolvedValueOnce(jsonResponse({ saved: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { onClose, onSaved } = renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })

    fireEvent.change(screen.getByLabelText('Contact number'), {
      target: { value: '07123 456789' },
    })
    fireEvent.change(screen.getByLabelText('Departure date'), {
      target: { value: '2026-09-10' },
    })
    fireEvent.change(screen.getByLabelText(/Return date/), {
      target: { value: '2026-09-20' },
    })
    fireEvent.change(screen.getByLabelText('ADT unit sale price'), {
      target: { value: '525.50' },
    })
    fireEvent.change(screen.getByLabelText('CHD unit sale price'), {
      target: { value: '410' },
    })
    fireEvent.change(screen.getByLabelText('CHD 1 passenger name'), {
      target: { value: 'Mariam Khan' },
    })
    fireEvent.change(screen.getByLabelText('CHD 1 ticket number'), {
      target: { value: 'tk-123456' },
    })
    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'paid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, request] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/ticketing/ledger/booking-1')
    expect(request).toMatchObject({
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': expect.any(String),
      },
    })
    const body = JSON.parse(String(request.body))
    expect(body).toMatchObject({
      expectedBookingVersion: 3,
      expectedTransactionVersion: 5,
      contactPhone: '07123 456789',
      departureDate: '2026-09-10',
      returnDate: '2026-09-20',
      paymentStatus: 'paid',
      paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      onBehalfReason: null,
      fareSales: [
        { passengerType: 'ADT', unitSalePrice: 525.5 },
        { passengerType: 'CHD', unitSalePrice: 410 },
      ],
      passengers: [
        { passengerType: 'ADT', position: 1, fullName: 'Aisha Khan' },
        {
          passengerType: 'CHD',
          position: 1,
          fullName: 'Mariam Khan',
          ticketNumber: 'TK-123456',
        },
      ],
    })
    expect(toastMocks.success).toHaveBeenCalledWith('Ticket details saved')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('requires and records an audited reason when an admin completes details on behalf of the responsible agent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(DETAIL, ON_BEHALF_COMPLETION_CONTEXT))
      .mockResolvedValueOnce(jsonResponse({ saved: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { onClose, onSaved } = renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })

    expect(screen.getByLabelText('On-behalf completion').textContent).toContain(
      'Responsible agent: Agent One',
    )
    expect(screen.getByLabelText('On-behalf completion').textContent).toContain(
      'Ticket responsibility and staff attribution stay with the responsible agent.',
    )
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()

    fireEvent.change(screen.getByLabelText('Contact number'), { target: { value: '07123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save on behalf' }))

    expect(
      screen.getByText('Enter a reason for completing this ticket on behalf of staff.'),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('On-behalf completion reason'), {
      target: { value: 'Completing the record while Agent One is off sick' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save on behalf' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, request] = fetchMock.mock.calls[1]
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    const body = JSON.parse(String(request?.body))
    expect(body.onBehalfReason).toBe('Completing the record while Agent One is off sick')
    expect(body).not.toHaveProperty('ownerEmployeeId')
    expect(body).not.toHaveProperty('actingEmployeeId')
    expect(body).not.toHaveProperty('responsibleEmployeeId')
    expect(toastMocks.success).toHaveBeenCalledWith('Ticket details saved on behalf of Agent One')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('requires all missing issued sale prices together and all sales before Paid', async () => {
    const fetchMock = vi.fn(async () => completionResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })

    fireEvent.change(screen.getByLabelText('ADT unit sale price'), {
      target: { value: '525' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    expect(
      screen.getByText(
        'For an issued ticket, enter every missing grouped sale price together or leave them all blank.',
      ),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'paid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(
      screen.getByText('Every grouped sale price is required before marking this ticket Paid.'),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('confirms before discarding a dirty draft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completionResponse()),
    )
    const { onClose } = renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })
    fireEvent.change(screen.getByLabelText('Contact number'), { target: { value: '07123' } })

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }))
    expect(screen.getByRole('dialog', { name: 'Discard unsaved ticket details?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('keeps the draft and idempotency key available for retry after a version conflict', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse())
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Ticket version changed', code: 'VERSION_CONFLICT' }, 409),
      )
      .mockResolvedValueOnce(jsonResponse({ saved: true }))
    vi.stubGlobal('fetch', fetchMock)
    renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })

    const contact = screen.getByLabelText('Contact number') as HTMLInputElement
    fireEvent.change(contact, { target: { value: '07123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByText(/This ticket changed after you opened it/)).toBeTruthy()
    expect(contact.value).toBe('07123')
    const firstKey = fetchMock.mock.calls[1][1]?.headers['Idempotency-Key']

    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[2][1]?.headers['Idempotency-Key']).toBe(firstKey)
  })

  it('fails closed for an existing Part Paid record', async () => {
    const partPaidDetail: TicketCompletionDetail = {
      ...DETAIL,
      paymentStatus: 'part_paid',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completionResponse(partPaidDetail)),
    )
    renderDrawer()
    await screen.findByRole('dialog', { name: 'Complete ABC123 ticket details' })

    expect(screen.getByRole('alert').textContent).toMatch(/read-only here/i)
    expect((screen.getByLabelText('Contact number') as HTMLInputElement).matches(':disabled')).toBe(
      true,
    )
    expect((screen.getByLabelText('Payment status') as HTMLSelectElement).value).toBe('part_paid')
    expect(
      (screen.getByRole('button', { name: 'Save details' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
