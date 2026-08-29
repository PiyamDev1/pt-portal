import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAeroDataBoxFlight } from '@/lib/ticketing/aerodatabox.server'

describe('AeroDataBox server client', () => {
  beforeEach(() => {
    process.env.AERODATABOX_API_KEY = 'test-key'
    process.env.AERODATABOX_API_BASE_URL = 'https://aerodatabox.p.rapidapi.com'
    process.env.AERODATABOX_API_HOST = 'aerodatabox.p.rapidapi.com'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.AERODATABOX_API_KEY
    delete process.env.AERODATABOX_API_BASE_URL
    delete process.env.AERODATABOX_API_HOST
  })

  it('normalizes the provider schedule without exposing credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            number: 'TK 1991',
            status: 'Expected',
            departure: {
              airport: { iata: 'IST' },
              scheduledTime: { local: '2026-09-01 10:30+03:00' },
              revisedTime: { local: '2026-09-01 10:45+03:00' },
            },
            arrival: {
              airport: { iata: 'MAN' },
              scheduledTime: { local: '2026-09-01 12:40+01:00' },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAeroDataBoxFlight({
      flightNumber: 'TK1991',
      departureDate: '2026-09-01',
    })

    expect(result).toMatchObject({
      ok: true,
      httpStatus: 200,
      schedules: [
        {
          flightNumber: 'TK 1991',
          status: 'Expected',
          originIata: 'IST',
          destinationIata: 'MAN',
          departureLocal: '2026-09-01T10:45',
          arrivalLocal: '2026-09-01T12:40',
        },
      ],
    })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toMatchObject({
      'X-RapidAPI-Key': 'test-key',
      'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
    })
    expect(JSON.stringify(result)).not.toContain('test-key')
  })

  it('returns a bounded provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    const result = await fetchAeroDataBoxFlight({
      flightNumber: 'PK701',
      departureDate: '2026-09-02',
    })

    expect(result).toEqual({
      ok: false,
      httpStatus: 429,
      endpoint: '/flights/number/PK701/2026-09-02?withAircraftImage=false&withLocation=false',
      error: 'Provider returned HTTP 429',
    })
  })
})
