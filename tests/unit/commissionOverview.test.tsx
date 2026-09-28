import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CommissionDiagnosticsNotice,
  CommissionOverview,
} from '@/app/dashboard/commissions/CommissionOverview'

describe('CommissionOverview', () => {
  it('summarises a clear reconciliation and formats its shadow total', () => {
    render(
      <CommissionOverview
        overview={{ pendingEvents: 2, shadowTotalGbp: 1234.5 }}
        onOpenExceptions={vi.fn()}
      />,
    )

    expect(screen.getByText('No unresolved calculation issues')).toBeTruthy()
    expect(screen.getByText('2 source events can be processed.')).toBeTruthy()
    expect(screen.getByText('£1,234.50')).toBeTruthy()
  })

  it('opens the action queue when held events or exceptions need attention', () => {
    const onOpenExceptions = vi.fn()
    render(
      <CommissionOverview
        overview={{ heldEvents: 1, openExceptions: 2 }}
        onOpenExceptions={onOpenExceptions}
      />,
    )

    expect(screen.getByText('1 held event and 2 open exceptions need review.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open action queue' }))
    expect(onOpenExceptions).toHaveBeenCalledOnce()
  })

  it('keeps advanced diagnostics linked to the authoritative editor', () => {
    render(<CommissionDiagnosticsNotice />)

    expect(screen.getByRole('link', { name: 'Open Admin commission' }).getAttribute('href')).toBe(
      '/dashboard/admin-commission',
    )
  })
})
