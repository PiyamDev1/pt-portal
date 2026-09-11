// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoyaltyCampaignManager } from '@/app/dashboard/loyalty/LoyaltyCampaignManager'
import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'

const campaign: LoyaltyDashboardPayload['campaigns'][number] = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Gold Eid reward',
  eventId: '30000000-0000-4000-8000-000000000001',
  ruleName: 'Gold member reward',
  eventType: 'eid_gift',
  multiplier: null,
  bonusPoints: 100,
  referredCustomerPoints: null,
  startsAt: '2026-09-12T00:00:00.000Z',
  endsAt: '2026-09-20T00:00:00.000Z',
  eligibleServiceKeys: ['ticketing'],
  eligibleBranchIds: [],
  audienceTiers: ['Gold'],
  maxAwardsPerCustomer: 1,
  minimumSpendPence: 0,
  priority: 200,
  linkedCampaignId: null,
  perCustomerCap: 100,
  totalPointsBudget: 10_000,
  allowStacking: false,
  status: 'scheduled',
  terms: null,
  performance: { awardCount: 8, customerCount: 8, awardedPoints: 800, lastAwardedAt: null },
}

const options: LoyaltyDashboardPayload['campaignOptions'] = {
  services: [{ key: 'ticketing', label: 'Flight ticket', category: 'ticketing-packages' }],
  branches: [{ id: '20000000-0000-4000-8000-000000000001', name: 'Luton' }],
  walkInWindows: [],
}

const campaignEvent: LoyaltyDashboardPayload['campaignEvents'][number] = {
  id: '30000000-0000-4000-8000-000000000001',
  name: 'Gold Eid reward',
  description: 'A grouped Eid event.',
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
}

describe('LoyaltyCampaignManager', () => {
  it('shows performance, filters and an editable four-part campaign builder', () => {
    render(
      <LoyaltyCampaignManager
        campaignEvents={[campaignEvent]}
        campaigns={[campaign]}
        campaignOptions={options}
      />,
    )

    expect(screen.getByText('Gold Eid reward')).toBeTruthy()
    expect(screen.getByText('Gold member reward')).toBeTruthy()
    expect(screen.getByText('800')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Gold member reward' }))
    expect(screen.getByText('1. Reward and schedule')).toBeTruthy()
    expect(screen.getByText('2. Audience and scope')).toBeTruthy()
    expect(screen.getByText('3. Customer and budget limits')).toBeTruthy()
    expect(screen.getByText('4. Link and explain')).toBeTruthy()
    expect(screen.getByDisplayValue('Gold member reward')).toBeTruthy()
    expect(screen.getByText('Luton')).toBeTruthy()
  })

  it('duplicates an existing campaign into a new draft', () => {
    render(
      <LoyaltyCampaignManager
        campaignEvents={[campaignEvent]}
        campaigns={[campaign]}
        campaignOptions={options}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Gold member reward' }))
    expect(screen.getByDisplayValue('Gold member reward copy')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Create reward rule/ })).toBeTruthy()
  })
})
