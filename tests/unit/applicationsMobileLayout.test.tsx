import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApplicationsHubBody } from '@/app/dashboard/applications/components/ApplicationsHubBody'

const metrics = {
  total: 12,
  active: 4,
  done: 8,
  attention: 2,
  aging: { zeroToTwo: 2, threeToSeven: 1, eightPlus: 1 },
  stalled: 1,
}

describe('ApplicationsHubBody mobile composition', () => {
  it('marks service modules for the dedicated two-column phone layout', () => {
    const { container } = render(
      <ApplicationsHubBody
        stalledTotal={0}
        pakStalled={0}
        gbStalled={0}
        nadraStalled={0}
        visaStalled={0}
        dataWarnings={[]}
        locationName="Head Office"
        grandTotal={12}
        grandActive={4}
        grandDone={8}
        grandAttention={2}
        newToday={1}
        newWeek={3}
        doneWeek={2}
        visibleServices={[
          {
            key: 'pak-passport',
            visible: true,
            meta: {
              flag: '🇵🇰',
              title: 'PAK Passports',
              href: '/dashboard/applications/passports',
              color: 'bg-green-800',
              attentionLabel: 'pending',
              metrics,
            },
          },
          {
            key: 'gb-passport',
            visible: true,
            meta: {
              flag: '🇬🇧',
              title: 'GB Passports',
              href: '/dashboard/applications/passports-gb',
              color: 'bg-blue-900',
              attentionLabel: 'pending',
              metrics,
            },
          },
        ]}
        allRecent={[]}
        attentionRecords={[]}
      />,
    )

    expect(container.querySelector('.applications-service-grid')).toBeTruthy()
    expect(container.querySelectorAll('.applications-service-card')).toHaveLength(2)
    expect(screen.getAllByText('Open')).toHaveLength(2)
    expect(screen.getAllByText('Open Module')).toHaveLength(2)
  })
})
