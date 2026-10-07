import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import { GET } from '@/app/api/nadra/agent-options/route'

describe('GET /api/nadra/agent-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'manager-1' },
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockResolvedValue({ data: [], error: null })
  })

  it('returns the manager and recursive reports, excluding unrelated employees', async () => {
    mocks.select.mockResolvedValue({
      data: [
        {
          id: 'manager-1',
          full_name: 'Mina Manager',
          manager_id: null,
          roles: { name: 'Branch Manager' },
        },
        {
          id: 'agent-1',
          full_name: 'Aisha Agent',
          manager_id: 'manager-1',
          roles: null,
        },
        {
          id: 'agent-2',
          full_name: 'Zain Agent',
          manager_id: 'agent-1',
          roles: null,
        },
        {
          id: 'unrelated-1',
          full_name: 'Other Employee',
          manager_id: null,
          roles: null,
        },
      ],
      error: null,
    })

    const response = await GET(new Request('http://localhost/api/nadra/agent-options'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      canChangeAgent: true,
      agentOptions: [
        { id: 'agent-1', name: 'Aisha Agent' },
        { id: 'manager-1', name: 'Mina Manager' },
        { id: 'agent-2', name: 'Zain Agent' },
      ],
      role: 'Branch Manager',
    })
  })

  it('allows a Master Admin to select all employees even without direct reports', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
    })
    mocks.select.mockResolvedValue({
      data: [
        {
          id: 'admin-1',
          full_name: 'Amina Admin',
          manager_id: null,
          roles: [{ name: 'Master Admin' }],
        },
        {
          id: 'employee-1',
          full_name: 'Bilal Employee',
          manager_id: null,
          roles: null,
        },
      ],
      error: null,
    })

    const response = await GET(new Request('http://localhost/api/nadra/agent-options'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      canChangeAgent: true,
      agentOptions: [
        { id: 'admin-1', name: 'Amina Admin' },
        { id: 'employee-1', name: 'Bilal Employee' },
      ],
      role: 'Master Admin',
    })
  })

  it('returns the staff authorization response without creating a service client', async () => {
    const unauthorizedResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: unauthorizedResponse,
    })

    const response = await GET(new Request('http://localhost/api/nadra/agent-options'))

    expect(response).toBe(unauthorizedResponse)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
