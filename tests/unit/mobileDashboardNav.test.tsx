import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createBrowserClient: () => ({ auth: { getUser: mocks.getUser } }),
}))

import { MobileDashboardNav } from '@/app/dashboard/client-wrapper'

describe('MobileDashboardNav', () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            mobile_nav_shortcuts: ['packages', 'applications', 'timeclock'],
          },
        },
      },
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
