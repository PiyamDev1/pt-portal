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

  it('places Ticket Flight API after the Maintenance heading for organization admins', () => {
    render(<SettingsClient {...baseProps} userRole="Admin" />)

    const maintenanceHeading = screen.getByText('Maintenance')
    const flightApiButton = screen.getByRole('button', { name: 'Ticket Flight API' })

    expect(
      maintenanceHeading.compareDocumentPosition(flightApiButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('retains organization-admin authorization for Ticket Flight API', () => {
    render(<SettingsClient {...baseProps} userRole="Maintenance Admin" />)

    expect(screen.getByText('Maintenance')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ticket Flight API' })).toBeNull()
  })
})
