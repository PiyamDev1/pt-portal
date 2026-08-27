// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FlightMonitoringPanel } from '@/app/dashboard/ticketing/FlightMonitoringPanel'

const PAYLOAD = {
  generatedAt: '2026-08-26T10:00:00Z',
  counts: { upcoming: 2, changeMarked: 1, awaitingFinalisation: 0 },
  items: [
    {
      bookingId: 'booking-1',
      bookingVersion: 4,
      sectorId: 'sector-1',
      itineraryVersion: 2,
      sequenceNumber: 1,
      ownerEmployee: { id: 'agent-1', fullName: 'Agent One' },
      leadPassenger: 'Aisha Khan',
      pnr: 'ABC123',
      contactPhone: '07123 456789',
      passengerCount: 3,
      bookingStatus: 'issued',
      airline: { id: 'airline-tk', iataCode: 'TK', name: 'Turkish Airlines' },
      flightNumber: '1980',
      originIata: 'LHR',
      originTimezone: 'Europe/London',
      destinationIata: 'IST',
      destinationTimezone: 'Europe/Istanbul',
      departureLocal: '2026-09-01T14:30:00',
      departureAtUtc: '2026-09-01T13:30:00Z',
      arrivalLocal: '2026-09-01T20:20:00',
      arrivalAtUtc: '2026-09-01T17:20:00Z',
      scheduleStatus: 'on_schedule',
      activeScheduleChange: null,
      allowedScheduleActions: ['mark'],
    },
    {
      bookingId: 'booking-2',
      bookingVersion: 3,
      sectorId: 'sector-2',
      itineraryVersion: 1,
      sequenceNumber: 1,
      ownerEmployee: { id: 'agent-2', fullName: 'Agent Two' },
      leadPassenger: 'Bilal Ali',
      pnr: 'XYZ789',
      contactPhone: null,
      passengerCount: 1,
      bookingStatus: 'issued',
      airline: { id: 'airline-pk', iataCode: 'PK', name: 'Pakistan International Airlines' },
      flightNumber: '786',
      originIata: 'MAN',
      originTimezone: 'Europe/London',
      destinationIata: 'ISB',
      destinationTimezone: 'Asia/Karachi',
      departureLocal: '2026-09-02T19:15:00',
      departureAtUtc: '2026-09-02T18:15:00Z',
      arrivalLocal: null,
      arrivalAtUtc: null,
      scheduleStatus: 'change_marked',
      activeScheduleChange: {
        changeId: 'change-2',
        eventVersion: 1,
        proposedSchedule: {
          flightNumber: 'PK 788',
          departureLocal: '2026-09-02T20:15:00',
          departureAtUtc: '2026-09-02T19:15:00Z',
          arrivalLocal: null,
          arrivalAtUtc: null,
        },
        markedBy: { id: 'agent-1', fullName: 'Agent One' },
        markedAt: '2026-08-27T10:00:00Z',
        markReason: 'Airline schedule email received',
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
      },
      allowedScheduleActions: [],
    },
  ],
  nextCursor: null,
}

describe('FlightMonitoringPanel', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows every agent using operational flight fields only', async () => {
    const fetchMock = vi.fn(async () => Response.json(PAYLOAD))
    vi.stubGlobal('fetch', fetchMock)

    render(<FlightMonitoringPanel />)

    expect(await screen.findByText('Aisha Khan')).toBeTruthy()
    expect(screen.getByText('Agent One')).toBeTruthy()
    expect(screen.getByText('Agent Two')).toBeTruthy()
    expect(screen.getByText('ABC123')).toBeTruthy()
    expect(screen.getByText('07123 456789')).toBeTruthy()
    expect(screen.getByText('TK 1980')).toBeTruthy()
    expect(screen.getByText('LHR → IST')).toBeTruthy()
    expect(screen.getAllByText('Europe/London')).toHaveLength(2)
    expect(screen.getAllByText('On Schedule')).toHaveLength(2)
    expect(screen.getAllByText('Change Marked')).toHaveLength(2)
    expect(screen.getByText('Not recorded')).toBeTruthy()
    expect(screen.getByText('All agents')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/commission|profit|margin|fare|payment/i)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/flight-monitor?limit=100',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('filters locally by agent, PNR, route and schedule state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(PAYLOAD)),
    )
    render(<FlightMonitoringPanel />)
    expect(await screen.findByText('Aisha Khan')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search upcoming flights'), {
      target: { value: 'Agent Two' },
    })
    expect(screen.queryByText('Aisha Khan')).toBeNull()
    expect(screen.getByText('Bilal Ali')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search upcoming flights'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Filter flights by status'), {
      target: { value: 'on_schedule' },
    })
    expect(screen.getByText('Aisha Khan')).toBeTruthy()
    expect(screen.queryByText('Bilal Ali')).toBeNull()
  })

  it('does not repeat an airline code already included in the flight number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...PAYLOAD,
          items: [{ ...PAYLOAD.items[0], flightNumber: 'TK1980' }],
        }),
      ),
    )
    render(<FlightMonitoringPanel />)

    expect(await screen.findByText('TK1980')).toBeTruthy()
    expect(screen.queryByText('TK TK1980')).toBeNull()
  })

  it('retains existing rows when a manual refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(PAYLOAD))
      .mockResolvedValueOnce(Response.json({ error: 'Temporarily unavailable' }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<FlightMonitoringPanel />)
    expect(await screen.findByText('Aisha Khan')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh upcoming flights' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Temporarily unavailable Existing departures remain visible.',
    )
    expect(screen.getByText('Aisha Khan')).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('marks a proposed schedule change with local times and an audit note', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(PAYLOAD))
      .mockResolvedValueOnce(Response.json({ action: 'mark' }))
      .mockResolvedValueOnce(Response.json(PAYLOAD))
    vi.stubGlobal('fetch', fetchMock)
    render(<FlightMonitoringPanel />)
    expect(await screen.findByText('Aisha Khan')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Mark change' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark change' })
    fireEvent.change(within(dialog).getByLabelText('Proposed flight number'), {
      target: { value: 'TK 1982' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^Proposed departure/), {
      target: { value: '2026-09-01T16:00' },
    })
    fireEvent.change(within(dialog).getByLabelText('Operational note'), {
      target: { value: 'Airline schedule email received' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark change' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/ticketing/flight-monitor/sector-1/schedule-change',
    )
    const mutation = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(mutation).toEqual(
      expect.objectContaining({
        action: 'mark',
        expectedItineraryVersion: 2,
        changeId: null,
        proposal: {
          flightNumber: 'TK 1982',
          departureLocal: '2026-09-01T16:00',
          arrivalLocal: '2026-09-01T20:20',
        },
        reason: 'Airline schedule email received',
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reviews an open change without letting the browser replace its proposal', async () => {
    const reviewPayload = {
      ...PAYLOAD,
      items: [
        {
          ...PAYLOAD.items[1],
          allowedScheduleActions: ['review', 'dismiss'],
        },
      ],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(reviewPayload))
      .mockResolvedValueOnce(Response.json({ action: 'review' }))
      .mockResolvedValueOnce(Response.json(reviewPayload))
    vi.stubGlobal('fetch', fetchMock)
    render(<FlightMonitoringPanel />)
    expect(await screen.findByText('Bilal Ali')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    const dialog = screen.getByRole('dialog', { name: 'Review change' })
    expect(within(dialog).getByText('Proposed PK 788')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Operational note'), {
      target: { value: 'Checked against the airline notice' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const mutation = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(mutation).toEqual(
      expect.objectContaining({
        action: 'review',
        expectedItineraryVersion: 1,
        changeId: 'change-2',
        proposal: null,
        reason: 'Checked against the airline notice',
      }),
    )
  })
})
