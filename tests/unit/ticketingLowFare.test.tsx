// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LowFareClient } from '@/app/dashboard/ticketing/low-fare/LowFareClient'
import type { LowFareQueueItem } from '@/app/dashboard/ticketing/low-fare/types'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

const ITEM: LowFareQueueItem = {
  bookingId: '22222222-2222-4222-8222-222222222222',
  bookingVersion: 4,
  rootTransactionId: '33333333-3333-4333-8333-333333333333',
  rootTransactionVersion: 7,
  pnr: 'ABC123',
  airline: {
    id: '55555555-5555-4555-8555-555555555555',
    iataCode: 'TK',
    name: 'Turkish Airlines',
  },
  departureDate: '2026-09-14',
  returnDate: '2026-09-28',
  passengerCount: 2,
  owner: { employeeId: '11111111-1111-4111-8111-111111111111', fullName: 'Agent One' },
  issuedDate: '2026-08-22',
  initialSupplierFareGbp: '420.00',
  currentSupplierFareGbp: '420.00',
  latestAdjustment: null,
  packageMatchStatus: 'unmatched',
  updatedAt: '2026-08-24T10:00:00.000Z',
}

const ADJUSTED_ITEM: LowFareQueueItem = {
  ...ITEM,
  initialSupplierFareGbp: '450.00',
  latestAdjustment: {
    adjustmentId: '44444444-4444-4444-8444-444444444444',
    previousAdjustmentId: null,
    sequenceNumber: 1,
    originalSupplierFareGbp: '450.00',
    newSupplierFareGbp: '420.00',
    differenceGbp: '30.00',
    effectiveDate: '2026-08-23',
    actingEmployeeId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-08-23T12:00:00.000Z',
  },
}

function queueResponse(items: LowFareQueueItem[] = [ITEM], hasMore = false) {
  return new Response(
    JSON.stringify({ items, hasMore, nextCursor: hasMore ? 'next-page' : null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function saveResponse() {
  return new Response(
    JSON.stringify({
      bookingId: ITEM.bookingId,
      bookingVersion: 5,
      rootTransactionId: ITEM.rootTransactionId,
      rootTransactionVersion: ITEM.rootTransactionVersion,
      adjustmentId: '66666666-6666-4666-8666-666666666666',
      previousAdjustmentId: ADJUSTED_ITEM.latestAdjustment?.adjustmentId,
      sequenceNumber: 2,
      currency: 'GBP',
      originalSupplierFareGbp: '420.00',
      newSupplierFareGbp: '380.00',
      differenceGbp: '40.00',
      passengerCount: 2,
      effectiveDate: '2026-08-24',
      packageMatchStatus: 'unmatched',
      createdAt: '2026-08-24T12:00:00.000Z',
      idempotentReplay: false,
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('LowFareClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('shows the shared all-agent queue and applies exact operational filters on the server', async () => {
    const fetchMock = vi.fn(async () => queueResponse())
    vi.stubGlobal('fetch', fetchMock)

    render(<LowFareClient />)

    expect(await screen.findByText('ABC123')).toBeTruthy()
    expect(screen.getAllByText('Agent One')).toHaveLength(2)
    expect(screen.getByText('Turkish Airlines', { exact: false })).toBeTruthy()
    expect(screen.getAllByText('£420.00')).toHaveLength(2)
    expect(screen.getByText('Never adjusted')).toBeTruthy()
    expect(screen.getByText(/issued tickets owned by every Ticketing agent/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Exact PNR'), { target: { value: 'ab c123' } })
    fireEvent.change(screen.getByLabelText('Airline'), { target: { value: 'tk' } })
    fireEvent.change(screen.getByLabelText('Ticket owner'), {
      target: { value: ITEM.owner.employeeId },
    })
    fireEvent.change(screen.getByLabelText('Departure from'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(screen.getByLabelText('Departure to'), {
      target: { value: '2026-09-30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const requestUrl = new URL(String(fetchMock.mock.calls[1][0]), 'https://portal.test')
    expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
      pnr: 'ABC123',
      airline: 'TK',
      owner: ITEM.owner.employeeId,
      departureFrom: '2026-09-01',
      departureTo: '2026-09-30',
      limit: '50',
    })
  })

  it('previews signed lower and higher fares and posts only operational adjustment fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(queueResponse([ADJUSTED_ITEM]))
      .mockResolvedValueOnce(saveResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Refresh unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<LowFareClient />)

    expect(await screen.findByText('ABC123')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Record fare for ABC123' }))

    const fareInput = screen.getByLabelText('New supplier fare for ABC123')
    expect(screen.getByLabelText('New fare issue date').getAttribute('min')).toBe('2026-08-23')
    fireEvent.change(fareInput, { target: { value: '450.00' } })
    expect(screen.getByText('-£30.00 fare increase')).toBeTruthy()
    fireEvent.change(fareInput, { target: { value: '380.00' } })
    expect(screen.getByText('+£40.00 lower fare')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New fare issue date'), {
      target: { value: '2026-08-24' },
    })
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Supplier portal fare' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record fare' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const [, request] = fetchMock.mock.calls[1]
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    const body = JSON.parse(String(request?.body))
    expect(body).toEqual({
      bookingId: ITEM.bookingId,
      expectedBookingVersion: 4,
      expectedRootTransactionVersion: 7,
      expectedPreviousAdjustmentId: '44444444-4444-4444-8444-444444444444',
      newSupplierFareGbp: 380,
      effectiveDate: '2026-08-24',
      notes: 'Supplier portal fare',
      currency: 'GBP',
    })
    expect(body).not.toHaveProperty('employeeId')
    expect(body).not.toHaveProperty('commission')
    expect(body).not.toHaveProperty('saleCost')
    expect(toastMocks.success).toHaveBeenCalledWith('Lower supplier fare recorded')
    expect(await screen.findByText(/Existing results remain visible/)).toBeTruthy()
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('rejects a no-change observation instead of creating an adjustment', async () => {
    const fetchMock = vi.fn(async () => queueResponse())
    vi.stubGlobal('fetch', fetchMock)

    render(<LowFareClient />)

    expect(await screen.findByText('ABC123')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Record fare for ABC123' }))
    expect(screen.getByLabelText('New fare issue date').getAttribute('min')).toBe('2026-08-22')
    fireEvent.change(screen.getByLabelText('New supplier fare for ABC123'), {
      target: { value: '420.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record fare' }))

    expect(screen.getByText('Enter a fare different from the current supplier fare.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
