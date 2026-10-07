import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FolderTree } from 'lucide-react'
import PosConfigurationOverview from '@/app/dashboard/accounting/pos-configuration/PosConfigurationOverview'

describe('POS configuration overview', () => {
  it('renders the supplied summary and setup sequence', () => {
    render(
      <PosConfigurationOverview
        overviewCards={[{ label: 'Active categories', value: 4, icon: FolderTree }]}
        integrityIssues={[]}
      />,
    )

    expect(screen.getByText('Active categories')).toBeTruthy()
    expect(within(screen.getByRole('article')).getByText('4')).toBeTruthy()
    expect(screen.getByText('No duplicates detected')).toBeTruthy()
    expect(screen.getByText('Recommended setup order')).toBeTruthy()
    expect(screen.getByText('Test in POS')).toBeTruthy()
  })

  it('displays integrity issues instead of the healthy state', () => {
    render(
      <PosConfigurationOverview
        overviewCards={[]}
        integrityIssues={['Duplicate active category: Remittance']}
      />,
    )

    expect(screen.getByText('Duplicate active category: Remittance')).toBeTruthy()
    expect(screen.queryByText('No duplicates detected')).toBeNull()
  })
})
