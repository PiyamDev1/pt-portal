// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTicketAirports } from '@/app/dashboard/ticketing/ledger/itineraryClientApi'

const LOOKUP_RESULT = {
  items: [
    {
      iataCode: 'LHR',
      name: 'London Heathrow Airport',
      city: 'London',
      countryCode: 'GB',
      timezone: 'Europe/London',
    },
  ],
}

describe('ticket itinerary airport client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('does not call the directory until there is a bounded lookup', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTicketAirports({ codes: [] })).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains completed searches in the browser module cache', async () => {
    const fetchMock = vi.fn(async () => Response.json(LOOKUP_RESULT))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTicketAirports({ query: 'LH', limit: 20 })).resolves.toEqual(
      LOOKUP_RESULT.items,
    )
    await expect(loadTicketAirports({ query: 'LH', limit: 20 })).resolves.toEqual(
      LOOKUP_RESULT.items,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/ticketing/airports?q=LH&limit=20', {
      cache: 'no-store',
      signal: undefined,
    })
  })
})
