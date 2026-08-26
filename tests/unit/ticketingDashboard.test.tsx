import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketingDashboard } from '@/app/dashboard/ticketing/TicketingDashboard'
import { TicketingPlaceholder } from '@/app/dashboard/ticketing/TicketingPlaceholder'

describe('TicketingDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          generatedAt: '2026-08-26T10:00:00Z',
          counts: { upcoming: 0, changeMarked: 0, awaitingFinalisation: 0 },
          items: [],
          nextCursor: null,
        }),
      ),
    )
  })

  it('opens the operational sales ledger and Low Fare queue while keeping refunds pending', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('link', { name: /Refund Calculator/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/refund-calculator',
    )
    expect(screen.getByRole('link', { name: /My Sales Ledger/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/ledger',
    )
    expect(screen.getByRole('link', { name: /Low Fare/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/low-fare',
    )
    expect(screen.getByRole('link', { name: /Flight Monitoring/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing#flight-monitoring',
    )
    expect(screen.getAllByText('Available')).toHaveLength(3)
    expect(screen.getAllByText('Coming soon')).toHaveLength(1)
  })

  it('loads the all-agent Flight Monitoring mini-module', async () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'Upcoming flights' })).toBeTruthy()
    expect(screen.getByText('All agents')).toBeTruthy()
    expect(await screen.findByText('No upcoming flights')).toBeTruthy()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/ticketing/flight-monitor?limit=100',
        expect.anything(),
      ),
    )
  })

  it('keeps the refund destination explicitly non-operational', () => {
    render(<TicketingPlaceholder kind="refund" />)

    expect(screen.getByRole('heading', { name: 'Refund Calculator' })).toBeTruthy()
    expect(screen.getByText(/No ticketing data is loaded, calculated or saved/)).toBeTruthy()
  })
})
