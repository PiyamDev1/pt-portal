import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PosWorkspaceHeader from '@/app/dashboard/pos/PosWorkspaceHeader'

describe('POS workspace header', () => {
  it('shows branch readiness and live sync context, and opens the tutorial', () => {
    const onOpenTutorial = vi.fn()

    render(
      <PosWorkspaceHeader
        modeLabel="Live ledger"
        upgradePending
        branchName="London Central"
        tutorialOpen={false}
        syncTitle="The ledger refreshes every two minutes"
        syncModeLabel="Live data · Auto 2 min"
        syncStatusLabel="Synced 10:32"
        onOpenTutorial={onOpenTutorial}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Daily transactions' })).toBeTruthy()
    expect(screen.getByText('Live ledger')).toBeTruthy()
    expect(screen.getByText('Upgrade pending')).toBeTruthy()
    expect(screen.getByText('London Central')).toBeTruthy()
    expect(screen.getByText('Synced 10:32')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open POS tutorial' }))
    expect(onOpenTutorial).toHaveBeenCalledOnce()
  })

  it('shows tutorial-only status without implying that example data is posted', () => {
    render(
      <PosWorkspaceHeader
        modeLabel="Design preview"
        upgradePending={false}
        branchName="Demo branch"
        tutorialOpen
        syncTitle="The tutorial uses browser-only examples"
        syncModeLabel="Tutorial examples"
        syncStatusLabel="Browser only · nothing posted"
        onOpenTutorial={() => {}}
      />,
    )

    expect(screen.getByText('Design preview')).toBeTruthy()
    expect(screen.getByText('Browser only · nothing posted')).toBeTruthy()
    expect(screen.queryByText('Upgrade pending')).toBeNull()
  })
})
