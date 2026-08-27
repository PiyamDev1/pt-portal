// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketQuickEntryForm } from '@/app/dashboard/ticketing/ledger/TicketQuickEntryForm'
import { TicketLedgerList } from '@/app/dashboard/ticketing/ledger/TicketLedgerList'
import type { TicketLedgerItem } from '@/app/dashboard/ticketing/ledger/types'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

const AIRLINES = [{ id: 'airline-tk', iataCode: 'TK', name: 'Turkish Airlines' }]
const NON_ADMIN_ATTRIBUTION_PROPS = {
  employeeId: 'employee-agent',
  employeeName: 'Agent One',
  canManageAttribution: false,
  attributionEmployees: [],
}

function fillRequiredIssuedFields() {
  fireEvent.change(screen.getByLabelText('Customer / lead passenger'), {
    target: { value: 'Aisha Khan' },
  })
  fireEvent.change(screen.getByLabelText('PNR'), { target: { value: 'ab c123' } })
  fireEvent.change(screen.getByLabelText('Airline'), { target: { value: 'tk' } })
  fireEvent.change(screen.getByLabelText('ADT unit fare cost'), { target: { value: '450.25' } })
}

describe('TicketQuickEntryForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('saves a GBP unpaid TK with a retry-safe idempotency header and resets for the next entry', async () => {
    const onCreated = vi.fn(async () => undefined)
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ bookingId: 'booking-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={onCreated}
      />,
    )

    fillRequiredIssuedFields()
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request?.body))
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    expect(body).toMatchObject({
      customerName: 'Aisha Khan',
      pnr: 'ABC123',
      airlineId: 'airline-tk',
      serviceType: 'TK',
      operationalStatus: 'issued',
      timeLimitAt: null,
      currency: 'GBP',
      fares: [{ passengerType: 'ADT', quantity: 1, unitSupplierCost: 450.25 }],
    })
    expect(body).not.toHaveProperty('employeeId')
    expect(body).not.toHaveProperty('responsibleEmployeeId')
    expect(body).not.toHaveProperty('assistantEmployeeIds')
    expect(body).not.toHaveProperty('attributionReason')
    expect(body).not.toHaveProperty('paymentStatus')
    expect(body).not.toHaveProperty('commission')
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(toastMocks.success).toHaveBeenCalledWith('TK ticket saved to the sales ledger')
    await waitFor(() =>
      expect((screen.getByLabelText('Customer / lead passenger') as HTMLInputElement).value).toBe(
        '',
      ),
    )
    expect((screen.getByLabelText('Airline') as HTMLInputElement).value).toBe('TK')
  })

  it('requires the branch-local airline deadline for a held ticket', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={vi.fn()}
      />,
    )

    fillRequiredIssuedFields()
    fireEvent.change(screen.getByLabelText('Ticket state'), { target: { value: 'held' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    expect(screen.getByText('A held booking needs an airline time limit.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Airline time limit'), {
      target: { value: '2026-09-01T16:30' },
    })
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.timeLimitAt).toBe('2026-09-01T16:30')
    expect(body.issuedAt).toBeNull()
  })

  it('rejects a held deadline before the booking date', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={vi.fn()}
      />,
    )

    fillRequiredIssuedFields()
    fireEvent.change(screen.getByLabelText('Ticket state'), { target: { value: 'held' } })
    fireEvent.change(screen.getByLabelText('Booking date'), { target: { value: '2026-09-02' } })
    fireEvent.change(screen.getByLabelText('Airline time limit'), {
      target: { value: '2026-09-01T16:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    expect(screen.getByText('Airline time limit cannot be before the booking date.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects more than 99 passengers across fare groups', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={vi.fn()}
      />,
    )

    fillRequiredIssuedFields()
    fireEvent.change(screen.getByLabelText('ADT quantity'), { target: { value: '99' } })
    fireEvent.change(screen.getByLabelText('CHD quantity'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('CHD unit fare cost'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    expect(screen.getByText('A quick entry can contain at most 99 passengers.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('locks the draft while a save request is pending', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={vi.fn()}
      />,
    )

    fillRequiredIssuedFields()
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect((screen.getByLabelText('Customer / lead passenger') as HTMLInputElement).disabled).toBe(
      true,
    )
    expect((screen.getByLabelText('Ticket state') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('ADT quantity') as HTMLInputElement).disabled).toBe(true)

    resolveRequest?.(
      new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled())
  })

  it('clears an unsaved row with Escape', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Customer / lead passenger'), {
      target: { value: 'Unsaved Customer' },
    })

    fireEvent.keyDown(screen.getByRole('form', { name: 'New TK ticket' }), { key: 'Escape' })

    expect((screen.getByLabelText('Customer / lead passenger') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('ADT quantity') as HTMLInputElement).value).toBe('1')
  })

  it('requires confirmation and retries the same request after a duplicate TK response', async () => {
    const onCreated = vi.fn(async () => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Duplicate TK',
            code: 'DUPLICATE_TK',
            existing: {
              bookingId: 'booking-old',
              pnr: 'ABC123',
              customerName: 'Existing Customer',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        {...NON_ADMIN_ATTRIBUTION_PROPS}
        onCreated={onCreated}
      />,
    )
    fillRequiredIssuedFields()

    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))
    expect(await screen.findByRole('dialog', { name: 'Another TK uses this PNR' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create another TK' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const firstRequest = fetchMock.mock.calls[0][1]
    const secondRequest = fetchMock.mock.calls[1][1]
    expect(firstRequest?.headers).toMatchObject(secondRequest?.headers as Record<string, string>)
    expect(JSON.parse(String(secondRequest?.body))).toMatchObject({ confirmDuplicate: true })
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })
})

describe('TicketLedgerList', () => {
  it('shows operational package evidence without rendering earnings language', () => {
    const item: TicketLedgerItem = {
      bookingId: 'booking-1',
      transactionId: 'transaction-1',
      bookingVersion: 4,
      transactionVersion: 7,
      pnr: 'ABC123',
      customerName: 'Aisha Khan',
      airline: AIRLINES[0],
      serviceType: 'TK',
      operationalStatus: 'issued',
      paymentStatus: 'unpaid',
      bookingDate: '2026-08-22',
      timeLimitAt: null,
      issuedAt: '2026-08-22',
      passengerCount: 2,
      packageMatchStatus: 'matched',
      commissionScope: 'package',
      detailsStatus: 'needs_details',
      responsibleEmployee: { id: 'employee-agent', fullName: 'Agent One' },
      assistantEmployees: [{ id: 'employee-assistant', fullName: 'Assistant One' }],
      attributionVersion: 1,
      fares: [
        { passengerType: 'ADT', quantity: 1, unitSupplierCost: 450, unitSalePrice: 500 },
        { passengerType: 'CHD', quantity: 1, unitSupplierCost: 350, unitSalePrice: 400 },
      ],
    }

    const onComplete = vi.fn()
    const onEditItinerary = vi.fn()
    render(
      <TicketLedgerList
        items={[item]}
        timezone="Europe/London"
        employeeId="employee-agent"
        currentTimeMs={Date.parse('2026-08-27T12:00:00Z')}
        onComplete={onComplete}
        onMarkPaid={vi.fn()}
        onEditItinerary={onEditItinerary}
        canManageAttribution={false}
        onCorrectAttribution={vi.fn()}
      />,
    )

    expect(screen.getByText('Package linked')).toBeTruthy()
    expect(screen.getByText('1 ADT · 1 CHD')).toBeTruthy()
    expect(screen.getByText('Needs details')).toBeTruthy()
    expect(screen.getByText('Responsible: Agent One')).toBeTruthy()
    expect(screen.getByText('Assisted by: Assistant One')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Complete details for ABC123' }))
    expect(onComplete).toHaveBeenCalledWith(item)
    fireEvent.click(screen.getByRole('button', { name: 'Edit itinerary for ABC123' }))
    expect(onEditItinerary).toHaveBeenCalledWith(item)
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()
  })

  it('keeps DC and R-ER financial rows out of the root TK completion action', () => {
    const child: TicketLedgerItem = {
      bookingId: 'booking-1',
      transactionId: 'transaction-dc-1',
      bookingVersion: 5,
      transactionVersion: 2,
      pnr: 'ABC123',
      customerName: 'Aisha Khan',
      airline: AIRLINES[0],
      serviceType: 'DC',
      operationalStatus: 'issued',
      paymentStatus: 'unpaid',
      bookingDate: '2026-08-23',
      timeLimitAt: null,
      issuedAt: '2026-08-23',
      passengerCount: 2,
      packageMatchStatus: 'unmatched',
      commissionScope: 'ticket',
      detailsStatus: 'recorded',
      responsibleEmployee: { id: 'employee-agent', fullName: 'Agent One' },
      assistantEmployees: [],
      attributionVersion: 1,
      fares: [{ passengerType: 'ADT', quantity: 2, unitSupplierCost: 10, unitSalePrice: 30 }],
    }
    const onComplete = vi.fn()
    const onMarkPaid = vi.fn()

    render(
      <TicketLedgerList
        items={[child]}
        timezone="Europe/London"
        employeeId="employee-agent"
        onComplete={onComplete}
        onMarkPaid={onMarkPaid}
        onEditItinerary={vi.fn()}
        canManageAttribution
        onCorrectAttribution={vi.fn()}
      />,
    )

    expect(screen.getByText('Service recorded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark DC for ABC123 as paid' }))
    expect(onMarkPaid).toHaveBeenCalledWith(child)
    expect(screen.queryByRole('button', { name: /details for ABC123/i })).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('offers itinerary editing only while a root TK is held or issued', () => {
    const item: TicketLedgerItem = {
      bookingId: 'booking-1',
      transactionId: 'transaction-1',
      bookingVersion: 4,
      transactionVersion: 7,
      pnr: 'ABC123',
      customerName: 'Aisha Khan',
      airline: AIRLINES[0],
      serviceType: 'TK',
      operationalStatus: 'cancelled',
      paymentStatus: 'paid',
      bookingDate: '2026-08-22',
      timeLimitAt: null,
      issuedAt: '2026-08-22',
      passengerCount: 1,
      packageMatchStatus: 'unmatched',
      detailsStatus: 'complete',
      responsibleEmployee: { id: 'employee-agent', fullName: 'Agent One' },
      assistantEmployees: [],
      attributionVersion: 1,
      fares: [{ passengerType: 'ADT', quantity: 1, unitSupplierCost: 450, unitSalePrice: 500 }],
    }

    render(
      <TicketLedgerList
        items={[item]}
        timezone="Europe/London"
        employeeId="employee-agent"
        onComplete={vi.fn()}
        onMarkPaid={vi.fn()}
        onEditItinerary={vi.fn()}
        canManageAttribution={false}
        onCorrectAttribution={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit itinerary for ABC123' })).toBeNull()
  })
})
