import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  PosSummaryStrip,
  PosWorkspaceMobileNavigation,
  PosWorkspaceNavigation,
} from '@/app/dashboard/pos/PosWorkspaceChrome'

const summary = {
  moneyIn: 500,
  moneyOut: 125,
  netMovement: 375,
  cashNet: 200,
  cardNet: 250,
  bankNet: -75,
  unreconciledCount: 1,
}

describe('POS workspace chrome', () => {
  it('renders period-aware financial summaries', () => {
    render(<PosSummaryStrip period="month" summary={summary} />)

    expect(screen.getByText('Month cash net')).toBeTruthy()
    expect(screen.getByText('+£200.00')).toBeTruthy()
    expect(screen.getByText('−£75.00')).toBeTruthy()
    expect(screen.getByText('£500.00 in · £125.00 out')).toBeTruthy()
    expect(screen.getByText('1 unreconciled tender')).toBeTruthy()
  })

  it('keeps manager-only destinations out of the standard navigation', () => {
    const onChange = vi.fn()
    render(
      <PosWorkspaceNavigation
        activeView="Daily transactions"
        canManage={false}
        onChange={onChange}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Import history' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(onChange).toHaveBeenCalledWith('Reports')
  })

  it('uses the same manager filtering and selection behavior on mobile', () => {
    const onChange = vi.fn()
    render(
      <PosWorkspaceMobileNavigation
        activeView="Daily transactions"
        canManage
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('option', { name: 'Import history' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'POS workspace section' }), {
      target: { value: 'Closeout' },
    })
    expect(onChange).toHaveBeenCalledWith('Closeout')
  })
})
