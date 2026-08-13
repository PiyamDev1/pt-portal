import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TicketingDashboard } from '@/app/dashboard/ticketing/TicketingDashboard'
import { TicketingPlaceholder } from '@/app/dashboard/ticketing/TicketingPlaceholder'

describe('TicketingDashboard', () => {
  it('shows both planned ticketing submodules as placeholders', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('link', { name: /Refund Calculator/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/refund-calculator',
    )
    expect(screen.getByRole('link', { name: /Ticketing Ledger/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/ledger',
    )
    expect(screen.getAllByText('Coming soon')).toHaveLength(2)
  })

  it('shows the empty upcoming-flight overview without claiming persisted data', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'Upcoming flights' })).toBeTruthy()
    expect(screen.getByText('No upcoming flights yet')).toBeTruthy()
    expect(screen.getByText(/No ticketing records are currently read from or written/)).toBeTruthy()
  })

  it('documents the planned mark, review and finalise schedule workflow', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'On schedule' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Change marked' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Finalised' })).toBeTruthy()
    expect(screen.getByText(/finalise it to update the active flight details/)).toBeTruthy()
  })

  it.each([
    ['refund', 'Refund Calculator'],
    ['ledger', 'Ticketing Ledger'],
  ] as const)('keeps the %s destination explicitly non-operational', (kind, title) => {
    render(<TicketingPlaceholder kind={kind} />)

    expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    expect(screen.getByText(/No ticketing data is loaded, calculated or saved/)).toBeTruthy()
  })
})
