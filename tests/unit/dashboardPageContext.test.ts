import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouteSupabaseClient: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`)
  }),
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

describe('loadDashboardPageContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the authenticated client and normalized page-header identity', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        full_name: 'Amina Khan',
        roles: [{ name: 'Admin' }],
        locations: [{ name: 'Bradford', branch_code: 'BD1' }],
      },
    })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'employee-1' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({ select })),
    }
    mocks.getRouteSupabaseClient.mockResolvedValue(supabase)

    await expect(loadDashboardPageContext()).resolves.toEqual({
      supabase,
      userId: 'employee-1',
      employeeName: 'Amina Khan',
      role: 'Admin',
      location: { name: 'Bradford', branch_code: 'BD1' },
    })
    expect(supabase.from).toHaveBeenCalledWith('employees')
    expect(select).toHaveBeenCalledWith('full_name, roles(name), locations(name, branch_code)')
    expect(eq).toHaveBeenCalledWith('id', 'employee-1')
  })

  it('redirects unauthenticated page requests before loading employee data', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid session' },
        }),
      },
      from: vi.fn(),
    }
    mocks.getRouteSupabaseClient.mockResolvedValue(supabase)

    await expect(loadDashboardPageContext()).rejects.toThrow('redirect:/login')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
