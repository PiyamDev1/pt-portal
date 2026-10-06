import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TravelPackageAuditEvent } from '@/app/types/packages'
import { PackageAuditHistoryPanel } from '@/app/dashboard/packages/[id]/PackageAuditHistoryPanel'

const event: TravelPackageAuditEvent = {
  id: 'audit-1',
  package_id: 'package-1',
  quote_id: null,
  actor_id: null,
  event_type: 'voucher_generated',
  event_summary: 'Transport voucher generated',
  before_data: null,
  after_data: null,
  metadata: {},
  created_at: '2026-10-01T12:30:00.000Z',
}

describe('PackageAuditHistoryPanel', () => {
  it('displays a human-readable audit event summary and type', () => {
    render(<PackageAuditHistoryPanel events={[event]} />)

    expect(screen.getByText('Transport voucher generated')).toBeTruthy()
    expect(screen.getByText(/Voucher Generated/)).toBeTruthy()
  })

  it('shows an empty state when there are no audit events', () => {
    render(<PackageAuditHistoryPanel events={[]} />)

    expect(screen.getByText('No audit events yet.')).toBeTruthy()
  })
})
