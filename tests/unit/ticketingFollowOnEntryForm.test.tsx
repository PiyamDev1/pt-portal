// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketFollowOnEntryForm } from '@/app/dashboard/ticketing/ledger/TicketFollowOnEntryForm'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const ROOT_TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

function bookingOption(
  overrides: Partial<{
    bookingId: string
    customerName: string
    bookingVersion: number
    rootTransactionVersion: number
    rootBookingDate: string
    departureDate: string
    returnDate: string | null
    commercialTreatment: 'standard' | 'staff_family' | 'commission_waived'
  }> = {},
) {
  return {
    bookingId: overrides.bookingId || BOOKING_ID,
    bookingVersion: overrides.bookingVersion || 4,
    rootTransactionId: ROOT_TRANSACTION_ID,
    rootTransactionVersion: overrides.rootTransactionVersion || 7,
    rootBookingDate: overrides.rootBookingDate || '2026-08-23',
    pnr: 'ABC123',
    customerName: overrides.customerName || 'Aisha Khan',
    contactPhone: '+44 7700 900123',
    departureDate: overrides.departureDate || '2026-09-01',
    returnDate: overrides.returnDate === undefined ? '2026-09-15' : overrides.returnDate,
    operationalStatus: 'issued',
    airline: { id: AIRLINE_ID, iataCode: 'TK', name: 'Turkish Airlines' },
    packageMatchStatus: 'unmatched',
    commercialTreatment: overrides.commercialTreatment || ('standard' as const),
    commissionWaiverReason:
      overrides.commercialTreatment === 'staff_family' ? 'Agent family booking' : null,
    staffFamilyChangeFeeGbp: 25,
    fares: [
      { passengerType: 'ADT', quantity: 2 },
      { passengerType: 'CHD', quantity: 1 },
    ],
    passengers: [
      {
        id: 'a1000000-0000-4000-8000-000000000001',
        passengerType: 'ADT',
        position: 1,
        fullName: 'Aisha Khan',
      },
      {
        id: 'a1000000-0000-4000-8000-000000000002',
        passengerType: 'ADT',
        position: 2,
        fullName: 'Bilal Khan',
      },
      {
        id: 'a1000000-0000-4000-8000-000000000003',
        passengerType: 'CHD',
        position: 1,
        fullName: 'Child Khan',
      },
    ],
  }
}

function findPnr() {
  fireEvent.change(screen.getByLabelText('Existing ticket PNR'), {
    target: { value: 'ab c123' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find PNR' }))
}

function fillAffectedCharges() {
  fireEvent.change(screen.getByLabelText('ADT unit service cost'), {
    target: { value: '10.00' },
  })
  fireEvent.change(screen.getByLabelText('ADT unit customer charge'), {
    target: { value: '30.00' },
  })
  fireEvent.change(screen.getByLabelText('CHD affected quantity'), { target: { value: '0' } })
}

function selectAllPassengers() {
  for (const checkbox of screen.getAllByRole('checkbox')) {
    if (!(checkbox as HTMLInputElement).checked) {
      fireEvent.click(checkbox)
    }
  }
}

describe('TicketFollowOnEntryForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('looks up an own issued PNR and saves a strict aggregate DC without identity or commission', async () => {
    const onCreated = vi.fn(async () => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [bookingOption()], hasMore: false, nextCursor: null }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactionId: 'child-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <TicketFollowOnEntryForm serviceType="DC" timezone="Europe/London" onCreated={onCreated} />,
    )

    findPnr()
    expect(await screen.findByText('Aisha Khan')).toBeTruthy()
    expect(screen.getByText('Root TK verified')).toBeTruthy()
    selectAllPassengers()
    fillAffectedCharges()
    fireEvent.click(screen.getByRole('button', { name: 'Save DC' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ticketing/bookings?pnr=ABC123')
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/ticketing/bookings/${BOOKING_ID}/transactions`)
    const request = fetchMock.mock.calls[1][1]
    const body = JSON.parse(String(request?.body))
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    expect(body).toMatchObject({
      expectedBookingVersion: 4,
      expectedRootTransactionVersion: 7,
      serviceType: 'DC',
      paymentStatus: 'unpaid',
      paidAt: null,
      currency: 'GBP',
      fares: [
        {
          passengerType: 'ADT',
          quantity: 2,
          unitSupplierCost: 10,
          unitSalePrice: 30,
        },
      ],
    })
    expect(body).not.toHaveProperty('employeeId')
    expect(body).not.toHaveProperty('ownerEmployeeId')
    expect(body).not.toHaveProperty('commission')
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(toastMocks.success).toHaveBeenCalledWith('DC date change saved to your ledger')
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()
  })

  it('locks a staff/family date change to airline cost plus the £25 admin fee', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [bookingOption({ commercialTreatment: 'staff_family' })],
          hasMore: false,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(Response.json({ transactionId: 'child-1' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <TicketFollowOnEntryForm serviceType="DC" timezone="Europe/London" onCreated={vi.fn()} />,
    )

    findPnr()
    expect(await screen.findByText('Aisha Khan')).toBeTruthy()
    selectAllPassengers()
    fireEvent.change(screen.getByLabelText('ADT unit service cost'), {
      target: { value: '10.00' },
    })
    fireEvent.change(screen.getByLabelText('CHD affected quantity'), { target: { value: '0' } })

    const customerCharge = screen.getByLabelText('ADT unit customer charge') as HTMLInputElement
    expect(customerCharge.disabled).toBe(true)
    expect(customerCharge.value).toBe('35.00')
    expect(
      screen.getByText(/No ordinary DC\/R-ER commission/i).closest('div')?.textContent,
    ).toContain('£25.00 per affected ticket')

    fireEvent.click(screen.getByRole('button', { name: 'Save DC' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(body.fares).toEqual([
      {
        passengerType: 'ADT',
        quantity: 2,
        unitSupplierCost: 10,
        unitSalePrice: 35,
      },
    ])
  })

  it('requires an explicit choice when the same PNR has multiple own issued records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [
            bookingOption(),
            bookingOption({
              bookingId: '80000000-0000-4000-8000-000000000002',
              departureDate: '2026-10-01',
              returnDate: null,
              rootBookingDate: '2026-08-25',
            }),
          ],
          hasMore: false,
          nextCursor: null,
        }),
      ),
    )
    render(
      <TicketFollowOnEntryForm serviceType="R-ER" timezone="Europe/London" onCreated={vi.fn()} />,
    )

    findPnr()
    expect(await screen.findByText('Choose the original ticket')).toBeTruthy()
    expect(screen.getByText('2026-09-01 → 2026-09-15')).toBeTruthy()
    expect(screen.getByText('2026-10-01 · One way')).toBeTruthy()
    expect(screen.getAllByText(/2 ADT · 1 CHD/)).toHaveLength(2)
    expect(screen.getByText(/Root booked 2026-08-25/)).toBeTruthy()
    expect(screen.getByText(/Record 00000002/)).toBeTruthy()
    expect(screen.queryByText('Root TK verified')).toBeNull()
    fireEvent.click(screen.getAllByRole('radio')[1])
    expect(screen.getByText('Root TK verified')).toBeTruthy()
    expect(screen.getByText('2026-10-01 · One way')).toBeTruthy()
    expect(screen.getByText(/Booked 2026-08-25 · Record 00000002/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save R-ER' })).toBeTruthy()
  })

  it('loads later pages when more than ten issued records share the exact PNR', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      bookingOption({
        bookingId: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      }),
    )
    const laterBooking = bookingOption({
      bookingId: '80000000-0000-4000-8000-000000000099',
      rootBookingDate: '2026-08-30',
      departureDate: '2026-11-01',
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: firstPage, hasMore: true, nextCursor: 'next-page' }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [laterBooking], hasMore: false, nextCursor: null }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketFollowOnEntryForm serviceType="DC" timezone="Europe/London" onCreated={vi.fn()} />,
    )

    findPnr()
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(10))
    expect(screen.getByText('Showing 10 matches. More issued tickets use this PNR.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more matches' }))

    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(11))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ticketing/bookings?pnr=ABC123&cursor=next-page')
    expect(screen.getByText(/Record 00000099/)).toBeTruthy()
  })

  it('requires full charges for affected groups and allows Paid with a paired date', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [bookingOption()], hasMore: false, nextCursor: null }),
      )
      .mockResolvedValueOnce(Response.json({ transactionId: 'child-1' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketFollowOnEntryForm serviceType="DC" timezone="Europe/London" onCreated={vi.fn()} />,
    )

    findPnr()
    await screen.findByText('Root TK verified')
    selectAllPassengers()
    fireEvent.change(screen.getByLabelText('CHD affected quantity'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save DC' }))
    expect(screen.getByText('Enter the unit service cost.')).toBeTruthy()
    expect(screen.getByText('Enter the unit customer charge.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fillAffectedCharges()
    fireEvent.change(screen.getByLabelText('Service payment status'), {
      target: { value: 'paid' },
    })
    expect(screen.getByLabelText('Service paid date')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save DC' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(body.paymentStatus).toBe('paid')
    expect(body.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('refreshes stale versions without silently resubmitting or losing entered charges', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [bookingOption()], hasMore: false, nextCursor: null }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: 'Ticket changed', code: 'VERSION_CONFLICT' }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [bookingOption({ bookingVersion: 5, rootTransactionVersion: 8 })],
          hasMore: false,
          nextCursor: null,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketFollowOnEntryForm serviceType="DC" timezone="Europe/London" onCreated={vi.fn()} />,
    )

    findPnr()
    await screen.findByText('Root TK verified')
    selectAllPassengers()
    fillAffectedCharges()
    fireEvent.click(screen.getByRole('button', { name: 'Save DC' }))

    expect(
      await screen.findByText(
        'The original ticket changed. Review the refreshed details and save again.',
      ),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((screen.getByLabelText('ADT unit service cost') as HTMLInputElement).value).toBe('10.00')
    expect((screen.getByLabelText('ADT unit customer charge') as HTMLInputElement).value).toBe(
      '30.00',
    )
  })

  it('clears the draft with Escape while retaining the selected service mode', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(
      <TicketFollowOnEntryForm serviceType="R-ER" timezone="Europe/London" onCreated={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText('Existing ticket PNR'), {
      target: { value: 'UNSAVED' },
    })

    fireEvent.keyDown(screen.getByRole('form', { name: 'New R-ER service' }), { key: 'Escape' })

    expect((screen.getByLabelText('Existing ticket PNR') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('New R-ER reissue')).toBeTruthy()
  })
})
