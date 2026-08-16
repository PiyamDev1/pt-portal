import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ redirect }))

import MyAccountPage from '@/app/dashboard/account/page'

describe('historic My Account route', () => {
  beforeEach(() => redirect.mockReset())

  it('uses the canonical Security & Password settings screen', () => {
    MyAccountPage()
    expect(redirect).toHaveBeenCalledWith('/dashboard/settings?tab=security')
  })
})
