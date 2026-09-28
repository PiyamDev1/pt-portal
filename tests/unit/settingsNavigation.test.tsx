import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchGet: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mocks.searchGet }),
}))

vi.mock('@/lib/auth/browserSupabase', () => ({
  getBrowserSupabaseClient: () => ({}),
}))

import SettingsClient from '@/app/dashboard/settings/client'

const baseProps = {
  currentUser: { id: 'staff-1', email: 'staff@example.com' },
  initialLocations: [],
  initialDepts: [],
  initialRoles: [],
  initialEmployees: [],
}

describe('Settings navigation', () => {
  beforeEach(() => {
    mocks.searchGet.mockReturnValue(null)
  })

  it('groups organization-admin settings by user goal', () => {
    render(<SettingsClient {...baseProps} userRole="Admin" />)

    const headings = ['Security', 'People & HR', 'Operations', 'Pricing', 'Maintenance'].map(
      (label) => screen.getByText(label),
    )

    headings.slice(1).forEach((heading, index) => {
      expect(
        headings[index].compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
    expect(screen.getByRole('link', { name: 'Pricing Management' }).getAttribute('href')).toBe(
      '/dashboard/pricing',
    )
    expect(screen.getByRole('button', { name: 'Ticket Flight API' })).toBeTruthy()
  })

  it('retains maintenance-admin scope while using the same goal groups', () => {
    render(<SettingsClient {...baseProps} userRole="Maintenance Admin" />)

    expect(screen.getByText('People & HR')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Staff Management' })).toBeTruthy()
    expect(screen.getByText('Operations')).toBeTruthy()
    expect(screen.getByText('Maintenance')).toBeTruthy()
    expect(screen.queryByText('Pricing')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Branches & Locations' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ticket Flight API' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Timeclock Devices' })).toBeNull()
  })
})
