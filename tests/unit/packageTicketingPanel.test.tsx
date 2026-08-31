// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PackageTicketingPanel from '@/app/dashboard/packages/[id]/PackageTicketingPanel'

const PACKAGE_ID = '5834e6c2-8fa5-49fa-b743-77fb219d2078'
const RESERVATION_ID = '2148735b-0426-4389-909e-29efa52ace36'

function response() {
  return Response.json({
    items: [
      {
        bookingId: '0eb85de7-4485-4a48-a123-821876bedb4a',
        pnr: 'NDJXDT',
        customerName: 'Package Passenger',
        airline: { id: 'airline-1', iataCode: 'TK', name: 'Turkish Airlines' },
        owner: { id: 'employee-1', fullName: 'Ticket Agent' },
        operationalStatus: 'issued',
        paymentStatus: 'unpaid',
        departureDate: null,
        returnDate: null,
        issuedAt: '2026-08-31T00:00:00Z',
        commissionScope: 'package',
        match: {
          packageId: PACKAGE_ID,
          reservationId: RESERVATION_ID,
          groupId: null,
          packageType: 'umrah',
          resolutionMethod: 'automatic',
        },
        passengers: [],
        latestFareVariance: null,
        refunds: [],
        vouchers: [],
      },
    ],
    summary: { ticketCount: 1, openRefunds: 0, openVouchers: 0 },
  })
}

describe('PackageTicketingPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the exact PNR against its package reservation and refreshes on return', async () => {
    const fetchMock = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PackageTicketingPanel
        packageId={PACKAGE_ID}
        reservationLabels={{ [RESERVATION_ID]: 'Return flights' }}
      />,
    )

    expect(await screen.findByText('NDJXDT')).toBeTruthy()
    expect(screen.getByText(/Matched to:/).textContent).toContain('Return flights')
    expect(fetchMock).toHaveBeenCalledWith(`/api/travel-packages/${PACKAGE_ID}/ticketing`, {
      cache: 'no-store',
    })

    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
