// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketVoucherClient } from '@/app/dashboard/ticketing/vouchers/TicketVoucherClient'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'

function ledgerPayload() {
  return {
    items: [
      {
        bookingId: BOOKING_ID,
        transactionId: '81000000-0000-4000-8000-000000000001',
        bookingVersion: 2,
        transactionVersion: 2,
        pnr: 'ABC123',
        customerName: 'Young Passenger',
        airline: {
          id: '50000000-0000-4000-8000-000000000001',
          iataCode: 'PK',
          name: 'Pakistan International Airlines',
        },
        serviceType: 'TK',
        operationalStatus: 'issued',
        paymentStatus: 'paid',
        bookingDate: '2026-08-15',
        timeLimitAt: null,
        issuedAt: '2026-08-20T12:00:00.000Z',
        passengerCount: 1,
        packageMatchStatus: 'unmatched',
        fares: [
          {
            passengerType: 'YTH',
            quantity: 1,
            unitSupplierCost: '500.00',
            unitSalePrice: '600.00',
          },
        ],
        responsibleEmployee: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
        assistantEmployees: [],
        attributionVersion: 1,
      },
    ],
    airlines: [],
    context: {
      employeeId: ACTOR_ID,
      employeeName: 'Ticketing Agent',
      locationName: 'London',
      timezone: 'Europe/London',
      canManageAttribution: false,
      canManageRecords: false,
      attributionEmployees: [{ id: ACTOR_ID, fullName: 'Ticketing Agent' }],
    },
    nextCursor: null,
  }
}

function detailPayload() {
  return {
    detail: {
      bookingId: BOOKING_ID,
      transactionId: '81000000-0000-4000-8000-000000000001',
      bookingVersion: 2,
      transactionVersion: 2,
      pnr: 'ABC123',
      customerName: 'Young Passenger',
      contactPhone: null,
      departureDate: '2026-09-10',
      returnDate: '2026-09-20',
      operationalStatus: 'issued',
      paymentStatus: 'paid',
      paidAt: '2026-08-20',
      airline: {
        id: '50000000-0000-4000-8000-000000000001',
        iataCode: 'PK',
        name: 'Pakistan International Airlines',
      },
      responsibleEmployee: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
      detailsStatus: 'complete',
      fares: [
        {
          id: 'fare-1',
          passengerType: 'YTH',
          quantity: 1,
          unitSupplierCost: 500,
          unitSalePrice: 600,
          salePriceLocked: true,
        },
      ],
      passengers: [
        {
          passengerType: 'YTH',
          position: 1,
          fullName: 'Young Passenger',
          contactPhone: null,
          dateOfBirth: '2010-01-01',
          ticketNumber: '1571234567890',
        },
      ],
    },
    completionContext: {
      ownerEmployee: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
      isOnBehalf: false,
      onBehalfReasonRequired: false,
      canManageRecords: false,
    },
  }
}

describe('TicketVoucherClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a voucher by stable passenger type and position without a database allocation id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [], nextCursor: null, context: { canManage: false } }),
      )
      .mockResolvedValueOnce(Response.json(ledgerPayload()))
      .mockResolvedValueOnce(Response.json(detailPayload()))
      .mockResolvedValueOnce(
        Response.json(
          {
            voucherId: '82000000-0000-4000-8000-000000000001',
            bookingId: BOOKING_ID,
            status: 'unclaimed',
            claimByDate: '2027-07-20',
            idempotentReplay: false,
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [], nextCursor: null, context: { canManage: false } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<TicketVoucherClient />)
    await screen.findByText('No Ticket Vouchers match these filters.')

    fireEvent.change(screen.getByLabelText('Exact PNR'), { target: { value: 'ab c123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find ticket' }))

    expect(await screen.findByText(/1571234567890/)).toBeTruthy()
    expect(screen.queryByLabelText('Follow-up owner')).toBeNull()
    expect(screen.queryByLabelText('Claim-by override')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save Ticket Voucher' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    const request = fetchMock.mock.calls[3][1] as RequestInit
    const body = JSON.parse(String(request.body))
    expect(fetchMock.mock.calls[3][0]).toBe('/api/ticketing/vouchers')
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    )
    expect(body).toMatchObject({
      bookingId: BOOKING_ID,
      passengerType: 'YTH',
      passengerPosition: 1,
      followUpEmployeeId: ACTOR_ID,
    })
    expect(JSON.stringify(body)).not.toMatch(/allocation|actorEmployee/i)
  })

  it('keeps unknown voucher value visibly unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [
            {
              id: '82000000-0000-4000-8000-000000000001',
              bookingId: BOOKING_ID,
              pnr: 'ABC123',
              ticketNumber: '1571234567890',
              passengerName: 'Young Passenger',
              passengerType: 'YTH',
              airline: {
                id: '50000000-0000-4000-8000-000000000001',
                iataCode: 'PK',
                name: 'Pakistan International Airlines',
              },
              owner: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
              followUpOwner: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
              issueDate: '2026-08-20',
              cancellationDate: '2026-08-29',
              claimByDate: '2027-07-20',
              status: 'unclaimed',
              confirmedValueGbp: null,
              remainingValueGbp: null,
              airlineReference: null,
              notes: null,
              version: 1,
              createdAt: '2026-08-29T12:00:00.000Z',
            },
          ],
          nextCursor: null,
          context: { canManage: false },
        }),
      ),
    )

    render(<TicketVoucherClient />)
    expect(await screen.findByText('Not confirmed')).toBeTruthy()
    expect(screen.queryByText('£0')).toBeNull()
  })
})
