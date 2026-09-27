import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AccountingPage from '@/app/dashboard/accounting/page'

describe('Accounting home', () => {
  it('offers the live Ticketing report without an operational sources segment', () => {
    render(<AccountingPage />)

    expect(screen.getByRole('link', { name: /Ticketing/i }).getAttribute('href')).toBe(
      '/dashboard/accounting/ticketing',
    )
    expect(screen.queryByRole('heading', { name: 'Operational sources' })).toBeNull()
    expect(screen.queryByText('Open source module')).toBeNull()
  })
})
