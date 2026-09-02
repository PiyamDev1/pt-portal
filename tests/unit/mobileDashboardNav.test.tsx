import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

import { MobileDashboardNav } from '@/app/dashboard/client-wrapper'

describe('MobileDashboardNav', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        mobileShortcutIds: ['packages', 'applications', 'timeclock'],
        moduleAccess: { role: 'Employee', departments: [] },
      }),
    })
  })

  it('keeps Home in the centre with three personal shortcuts and fixed Settings', async () => {
    render(<MobileDashboardNav />)

    await waitFor(() => expect(screen.getByLabelText('Packages')).toBeTruthy())
    const labels = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))

    expect(labels).toEqual(['Packages', 'Apps', 'Home', 'Clock', 'Settings'])
    expect(screen.getByLabelText('Home').getAttribute('aria-current')).toBe('page')
  })
})
