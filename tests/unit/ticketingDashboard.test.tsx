import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketingDashboard } from '@/app/dashboard/ticketing/TicketingDashboard'

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

  it('opens the calculator, operational sales ledger, Low Fare queue and Ticket Vouchers', () => {
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
    expect(screen.getByRole('link', { name: /Ticket Vouchers/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/vouchers',
    )
    expect(screen.queryByRole('link', { name: /Flight Monitoring/ })).toBeNull()
    expect(screen.getAllByText('Available')).toHaveLength(4)
    expect(screen.queryByText('Coming soon')).toBeNull()
  })

  it('loads the all-agent Flight Monitoring mini-module', async () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'Upcoming flights' })).toBeTruthy()
    expect(screen.getAllByText('All agents').length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText('No upcoming flights')).toBeTruthy()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/ticketing/flight-monitor?limit=100',
        expect.anything(),
      ),
    )
  })
})
