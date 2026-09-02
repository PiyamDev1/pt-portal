// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefundRegister } from '@/app/dashboard/ticketing/refund-calculator/RefundRegister'

const REFUND_ID = '80000000-0000-4000-8000-000000000001'

function refundPage() {
  return {
    items: [
      {
        id: REFUND_ID,
        bookingId: '81000000-0000-4000-8000-000000000001',
        pnr: 'ABC123',
        ticketNumber: '235-1234567890',
        passengerName: 'Aisha Khan',
        passengerType: 'ADT',
        airline: {
          id: '50000000-0000-4000-8000-000000000001',
          iataCode: 'TK',
          name: 'Turkish Airlines',
        },
        owner: { id: '40000000-0000-4000-8000-000000000001', fullName: 'Agent One' },
        settlementMode: 'refund',
        packageMatchStatus: 'unmatched',
        commissionScope: 'ticket',
        originalSalePriceGbp: 600,
        proposedCancellationChargeGbp: 160,
        proposedCustomerRefundGbp: 440,
        expectedAirlineRecoveryGbp: 390,
        expectedCompanyResultGbp: 10,
        customerSettledGbp: 440,
        airlineRecoveredGbp: 390,
        otherActualCostsGbp: 0,
        airlineRecoveryFinal: true,
        provisionalCompanyResultGbp: 10,
        actualCompanyResultGbp: null,
        confirmedCorrectAt: null,
        confirmedCorrectBy: null,
        status: 'part_settled',
        version: 4,
        notes: null,
        createdAt: '2026-09-02T09:00:00.000Z',
      },
    ],
    nextCursor: null,
    context: { canManage: false, canConfirm: true },
  }
}

describe('Refund register confirmation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lets the responsible agent confirm a finalised provisional Refund', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(refundPage()))
      .mockResolvedValueOnce(
        Response.json({
          refundId: REFUND_ID,
          eventId: '90000000-0000-4000-8000-000000000001',
          status: 'settled',
          version: 5,
          actualCompanyResultGbp: 10,
          idempotentReplay: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...refundPage(),
          items: [
            {
              ...refundPage().items[0],
              status: 'settled',
              version: 5,
              actualCompanyResultGbp: 10,
              confirmedCorrectAt: '2026-09-02T10:00:00.000Z',
              confirmedCorrectBy: {
                id: '40000000-0000-4000-8000-000000000001',
                fullName: 'Agent One',
              },
            },
          ],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<RefundRegister />)

    expect(await screen.findByText('Provisional')).toBeTruthy()
    expect(screen.getByText('£10.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Refund' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm Refund' }).at(-1)!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const confirmation = fetchMock.mock.calls[1]
    expect(confirmation[0]).toBe(`/api/ticketing/refunds/${REFUND_ID}/events`)
    expect(JSON.parse(String(confirmation[1]?.body))).toMatchObject({
      expectedVersion: 4,
      eventType: 'confirmed_correct',
      amountGbp: null,
    })
    expect(await screen.findByText('Confirmed correct')).toBeTruthy()
  })

  it('reuses the same idempotency key when a confirmation response is uncertain', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(refundPage()))
      .mockResolvedValueOnce(Response.json({ error: 'Temporary failure' }, { status: 500 }))
      .mockResolvedValueOnce(
        Response.json({
          refundId: REFUND_ID,
          eventId: '90000000-0000-4000-8000-000000000001',
          status: 'settled',
          version: 5,
          actualCompanyResultGbp: 10,
          idempotentReplay: true,
        }),
      )
      .mockResolvedValueOnce(Response.json(refundPage()))
    vi.stubGlobal('fetch', fetchMock)

    render(<RefundRegister />)
    await screen.findByText('Provisional')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Refund' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm Refund' }).at(-1)!)

    expect(await screen.findByText('Temporary failure')).toBeTruthy()
    const firstKey = fetchMock.mock.calls[1][1]?.headers['Idempotency-Key']

    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm Refund' }).at(-1)!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    expect(fetchMock.mock.calls[2][1]?.headers['Idempotency-Key']).toBe(firstKey)
  })
})
