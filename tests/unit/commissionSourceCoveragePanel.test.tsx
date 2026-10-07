import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CommissionSourceCoveragePanel from '@/app/dashboard/admin-commission/CommissionSourceCoveragePanel'

describe('Commission source coverage panel', () => {
  it('renders read-only operational module coverage and missing owners', () => {
    render(
      <CommissionSourceCoveragePanel
        modules={[
          {
            sourceModule: 'packages',
            label: 'Packages',
            pendingEvents: 2,
            processedEvents: 8,
            heldEvents: 1,
            activeEntries: 6,
            totalGbp: 1250,
            closedRecordsMissingEvent: 3,
            closedRecordsMissingOwner: 1,
          },
        ]}
        packageIntegrationReady
        applicationIntegrationReady
      />,
    )

    expect(screen.getByText('Commission across operational modules')).toBeTruthy()
    expect(screen.getByText('Packages')).toBeTruthy()
    expect(screen.getByText(/8 processed/)).toBeTruthy()
    expect(screen.getByText('3 closed records need capture')).toBeTruthy()
    expect(screen.getByText('1 missing sales owner')).toBeTruthy()
    expect(screen.getByText(/1,250/)).toBeTruthy()
  })

  it('shows the schema readiness warning and empty-state guidance', () => {
    render(
      <CommissionSourceCoveragePanel
        modules={[]}
        packageIntegrationReady={false}
        applicationIntegrationReady
      />,
    )

    expect(screen.getByText('Commission database upgrade required')).toBeTruthy()
    expect(
      screen.getByText(
        'Source-module health becomes available after the Commission integration migrations.',
      ),
    ).toBeTruthy()
  })
})
