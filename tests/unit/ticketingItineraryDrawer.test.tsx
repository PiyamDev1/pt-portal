// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketItineraryDrawer } from '@/app/dashboard/ticketing/ledger/TicketItineraryDrawer'
import type { TicketLedgerItem } from '@/app/dashboard/ticketing/ledger/types'

const AIRLINE = {
  id: '960a74c8-b83f-41a5-91a0-57b8988637c5',
  iataCode: 'TK',
  name: 'Turkish Airlines',
}
const ITEM: TicketLedgerItem = {
  bookingId: '55a7de68-d1b5-4b90-87e2-f58623bc7653',
  transactionId: 'transaction-1',
  bookingVersion: 8,
  transactionVersion: 5,
  pnr: 'ABC123',
  customerName: 'Aisha Khan',
  airline: AIRLINE,
  serviceType: 'TK',
  operationalStatus: 'issued',
  paymentStatus: 'paid',
  bookingDate: '2026-08-20',
  timeLimitAt: null,
  issuedAt: '2026-08-20',
  passengerCount: 2,
  packageMatchStatus: 'unmatched',
  detailsStatus: 'complete',
  responsibleEmployee: { id: 'agent-1', fullName: 'Agent One' },
  assistantEmployees: [],
  attributionVersion: 1,
  fares: [{ passengerType: 'ADT', quantity: 2, unitSupplierCost: 400, unitSalePrice: 450 }],
}

const AIRPORTS = {
  items: [
    {
      iataCode: 'LHR',
      name: 'Heathrow Airport',
      city: 'London',
      countryCode: 'GB',
      timezone: 'Europe/London',
    },
    {
      iataCode: 'IST',
      name: 'Istanbul Airport',
      city: 'Istanbul',
      countryCode: 'TR',
      timezone: 'Europe/Istanbul',
    },
    {
      iataCode: 'ISB',
      name: 'Islamabad International Airport',
      city: 'Islamabad',
      countryCode: 'PK',
      timezone: 'Asia/Karachi',
    },
  ],
}

function itineraryResponse({
  itineraryVersion = 0,
  isOnBehalf = false,
  sectors = [],
}: {
  itineraryVersion?: number
  isOnBehalf?: boolean
  sectors?: Array<Record<string, unknown>>
} = {}) {
  return {
    booking: {
      id: ITEM.bookingId,
      version: ITEM.bookingVersion,
      pnr: ITEM.pnr,
      customerName: ITEM.customerName,
      operationalStatus: 'issued',
      ownerEmployee: ITEM.responsibleEmployee,
      defaultAirline: AIRLINE,
    },
    context: { isOnBehalf, onBehalfReasonRequired: isOnBehalf },
    itineraryVersion,
    sectors,
  }
}

function savedSector(overrides: Record<string, unknown> = {}) {
  return {
    id: '4a2c2da2-8eb6-4269-b4d8-a84ce6c9cb8c',
    sequenceNumber: 1,
    itineraryVersion: 1,
    airline: AIRLINE,
    flightNumber: 'TK1980',
    originIata: 'LHR',
    originTimezone: 'Europe/London',
    destinationIata: 'IST',
    destinationTimezone: 'Europe/Istanbul',
    departureLocal: '2026-09-01T14:30:00',
    departureAtUtc: '2026-09-01T13:30:00Z',
    arrivalLocal: null,
    arrivalAtUtc: null,
    scheduleStatus: 'on_schedule',
    ...overrides,
  }
}

function setupFetch(
  initial = itineraryResponse(),
  saved = itineraryResponse({ itineraryVersion: 1, sectors: [savedSector()] }),
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/ticketing/airports')) {
      const parameters = new URL(url, 'http://localhost').searchParams
      const query = parameters.get('q')?.toUpperCase()
      const codes = new Set((parameters.get('codes') || '').split(',').filter(Boolean))
      return Response.json({
        items: AIRPORTS.items.filter((airport) =>
          query ? airport.iataCode.startsWith(query) : codes.has(airport.iataCode),
        ),
      })
    }
    if (init?.method === 'PUT') return Response.json(saved)
    return Response.json(initial)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('TicketItineraryDrawer', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('searches the stored directory by IATA code instead of loading the first alphabetic page', async () => {
    const fetchMock = setupFetch()
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'ABC123 itinerary' })).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/ticketing/airports')),
    ).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Flight sector 1 origin airport'), {
      target: { value: 'lhr' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 destination airport'), {
      target: { value: 'isb' },
    })

    expect(await screen.findByText('London · Europe/London')).toBeTruthy()
    expect(await screen.findByText('Islamabad · Asia/Karachi')).toBeTruthy()
    const airportUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/ticketing/airports'))
    expect(airportUrls).toContain('/api/ticketing/airports?q=LHR&limit=20')
    expect(airportUrls).toContain('/api/ticketing/airports?q=ISB&limit=20')
    expect(airportUrls).not.toContain('/api/ticketing/airports?limit=100')
  })

  it('saves an empty itinerary with airport-derived local inputs and dedicated version zero', async () => {
    const fetchMock = setupFetch()
    const onClose = vi.fn()
    const onSaved = vi.fn(async () => undefined)
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'ABC123 itinerary' })).toBeTruthy()
    expect((screen.getByLabelText('Flight sector 1 airline') as HTMLSelectElement).value).toBe('')

    fireEvent.change(screen.getByLabelText('Flight sector 1 flight number'), {
      target: { value: 'tk1980' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 origin airport'), {
      target: { value: 'lhr' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 destination airport'), {
      target: { value: 'ist' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 departure local time'), {
      target: { value: '2026-09-01T14:30' },
    })

    expect(await screen.findByText('London · Europe/London')).toBeTruthy()
    expect(await screen.findByText('Istanbul · Europe/Istanbul')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save itinerary' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true),
    )
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    const body = JSON.parse(String(putCall?.[1]?.body))
    expect(body).toMatchObject({
      expectedVersion: 0,
      adminReason: null,
      sectors: [
        {
          airlineId: null,
          flightNumber: 'TK1980',
          originIata: 'LHR',
          destinationIata: 'IST',
          departureLocal: '2026-09-01T14:30',
          arrivalLocal: null,
        },
      ],
    })
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(JSON.stringify(body)).not.toMatch(/timezone|atUtc|departureAt|arrivalAt/i)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('prefills a connecting sector origin from the previous destination', async () => {
    setupFetch()
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'ABC123 itinerary' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Flight sector 1 destination airport'), {
      target: { value: 'IST' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add another flight sector' }))

    expect(
      (screen.getByLabelText('Flight sector 2 origin airport') as HTMLInputElement).value,
    ).toBe('IST')
    expect((screen.getByLabelText('Flight sector 2 airline') as HTMLSelectElement).value).toBe('')
  })

  it('requires an audited reason when an admin updates another agent itinerary', async () => {
    const initial = itineraryResponse({
      itineraryVersion: 3,
      isOnBehalf: true,
      sectors: [savedSector({ itineraryVersion: 3 })],
    })
    const saved = itineraryResponse({
      itineraryVersion: 4,
      isOnBehalf: true,
      sectors: [savedSector({ itineraryVersion: 4, departureLocal: '2026-09-01T15:00:00' })],
    })
    const fetchMock = setupFetch(initial, saved)
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(await screen.findByText('Updating on behalf of staff')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Flight sector 1 departure local time'), {
      target: { value: '2026-09-01T15:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save on behalf' }))
    expect(
      screen.getByText('Enter a reason for updating this itinerary on behalf of staff.'),
    ).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('On-behalf itinerary reason'), {
      target: { value: 'Updating while Agent One is off sick' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save on behalf' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1),
    )
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    const body = JSON.parse(String(putCall?.[1]?.body))
    expect(body.expectedVersion).toBe(3)
    expect(body.adminReason).toBe('Updating while Agent One is off sick')
    expect(body).not.toHaveProperty('ownerEmployeeId')
    expect(body).not.toHaveProperty('responsibleEmployeeId')
  })

  it('rejects an identical origin and destination before sending a replacement', async () => {
    const fetchMock = setupFetch()
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'ABC123 itinerary' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Flight sector 1 flight number'), {
      target: { value: 'TK1980' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 origin airport'), {
      target: { value: 'LHR' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 destination airport'), {
      target: { value: 'LHR' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 departure local time'), {
      target: { value: '2026-09-01T14:30' },
    })
    await waitFor(() => expect(screen.getAllByText('London · Europe/London')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Save itinerary' }))

    expect(screen.getByText('Destination must be different from origin.')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })

  it('rejects a three-letter airport code that is not in the directory', async () => {
    const fetchMock = setupFetch()
    render(
      <TicketItineraryDrawer
        item={ITEM}
        airlines={[AIRLINE]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'ABC123 itinerary' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Flight sector 1 flight number'), {
      target: { value: '1980' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 origin airport'), {
      target: { value: 'ZZZ' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 destination airport'), {
      target: { value: 'IST' },
    })
    fireEvent.change(screen.getByLabelText('Flight sector 1 departure local time'), {
      target: { value: '2026-09-01T14:30' },
    })
    expect(await screen.findByText('Istanbul · Europe/Istanbul')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save itinerary' }))

    expect(screen.getByText('Choose an origin from the airport directory.')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })
})
