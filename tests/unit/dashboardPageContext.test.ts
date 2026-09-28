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
        email: 'amina@piyam.test',
        full_name: 'Amina Khan',
        roles: [{ name: 'Admin' }],
        locations: [
          {
            id: 'location-1',
            name: 'Bradford',
            branch_code: 'BD1',
            timezone: 'Europe/London',
            appointments_enabled: true,
          },
        ],
      },
    })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'employee-1',
              email: 'amina.auth@piyam.test',
              user_metadata: { preferred_name: 'Amina' },
            },
          },
          error: null,
        }),
      },
      from: vi.fn(() => ({ select })),
    }
    mocks.getRouteSupabaseClient.mockResolvedValue(supabase)

    await expect(loadDashboardPageContext()).resolves.toEqual({
      supabase,
      userId: 'employee-1',
      userEmail: 'amina.auth@piyam.test',
      userMetadata: { preferred_name: 'Amina' },
      employeeEmail: 'amina@piyam.test',
      employeeName: 'Amina Khan',
      role: 'Admin',
      location: {
        id: 'location-1',
        name: 'Bradford',
        branch_code: 'BD1',
        timezone: 'Europe/London',
        appointments_enabled: true,
      },
    })
    expect(supabase.from).toHaveBeenCalledWith('employees')
    expect(select).toHaveBeenCalledWith(
      'email, full_name, roles(name), locations(id, name, branch_code, timezone, appointments_enabled)',
    )
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

  it('uses the authenticated display name when the employee profile has no name', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { full_name: null, roles: null, locations: null },
    })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'employee-2',
              user_metadata: { full_name: '  Omar Ali  ' },
            },
          },
          error: null,
        }),
      },
      from: vi.fn(() => ({ select })),
    }
    mocks.getRouteSupabaseClient.mockResolvedValue(supabase)

    await expect(loadDashboardPageContext()).resolves.toMatchObject({
      userId: 'employee-2',
      employeeName: 'Omar Ali',
      role: undefined,
      location: undefined,
    })
  })
})
