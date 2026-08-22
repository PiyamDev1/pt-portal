import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TicketingDashboard } from '@/app/dashboard/ticketing/TicketingDashboard'
import { TicketingPlaceholder } from '@/app/dashboard/ticketing/TicketingPlaceholder'

describe('TicketingDashboard', () => {
  it('opens the operational sales ledger while keeping the refund tool pending', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('link', { name: /Refund Calculator/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/refund-calculator',
    )
    expect(screen.getByRole('link', { name: /My Sales Ledger/ }).getAttribute('href')).toBe(
      '/dashboard/ticketing/ledger',
    )
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getAllByText('Coming soon')).toHaveLength(1)
  })

  it('keeps flight monitoring pending without describing the ledger as a placeholder', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'Upcoming flights' })).toBeTruthy()
    expect(screen.getByText('No upcoming flights yet')).toBeTruthy()
    expect(screen.getByText(/TK records can now be added through My Sales Ledger/)).toBeTruthy()
  })

  it('documents the planned mark, review and finalise schedule workflow', () => {
    render(<TicketingDashboard />)

    expect(screen.getByRole('heading', { name: 'On schedule' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Change marked' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Finalised' })).toBeTruthy()
    expect(screen.getByText(/finalise it to update the active flight details/)).toBeTruthy()
  })

  it('keeps the refund destination explicitly non-operational', () => {
    render(<TicketingPlaceholder kind="refund" />)

    expect(screen.getByRole('heading', { name: 'Refund Calculator' })).toBeTruthy()
    expect(screen.getByText(/No ticketing data is loaded, calculated or saved/)).toBeTruthy()
  })
})
