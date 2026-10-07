import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PackagesDashboardHeader from '@/app/dashboard/packages/PackagesDashboardHeader'

const stats = {
  actionCount: 7,
  activeFolderCount: 4,
  liveCustomerLinkCount: 9,
  activeGroupCount: 2,
}

describe('PackagesDashboardHeader', () => {
  it('presents the workspace summary and primary destinations', () => {
    render(<PackagesDashboardHeader {...stats} showLegacyMigration={false} />)

    expect(screen.getByRole('heading', { name: 'Package operations' })).toBeTruthy()
    expect(screen.getByText('Action queue').parentElement?.parentElement?.textContent).toContain(
      '7',
    )
    expect(screen.getByText('Active folders').parentElement?.parentElement?.textContent).toContain(
      '4',
    )
    expect(
      screen.getByText('Live customer links').parentElement?.parentElement?.textContent,
    ).toContain('9')
    expect(screen.getByText('Group packages').parentElement?.parentElement?.textContent).toContain(
      '2',
    )
    expect(screen.getByRole('link', { name: /Haramain Map/ }).getAttribute('href')).toBe(
      'https://haramain-maps-live.web.app/',
    )
    expect(screen.getByRole('link', { name: 'Create quotation' }).getAttribute('href')).toBe(
      '/dashboard/packages/quotations/new',
    )
    expect(screen.queryByRole('link', { name: 'Legacy Migration' })).toBeNull()
  })

  it('only shows the legacy migration destination when authorized by the parent', () => {
    render(<PackagesDashboardHeader {...stats} showLegacyMigration />)

    expect(screen.getByRole('link', { name: 'Legacy Migration' }).getAttribute('href')).toBe(
      '/dashboard/packages/migration',
    )
  })
})
