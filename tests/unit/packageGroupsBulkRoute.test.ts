import { beforeEach, describe, expect, it, vi } from 'vitest'

const GROUP_ONE = '11111111-1111-4111-8111-111111111111'
const GROUP_TWO = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => {
  const requireStaffSession = vi.fn()
  const updateSelect = vi.fn()
  const updateIn = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ in: updateIn }))
  const deleteSelect = vi.fn()
  const deleteIn = vi.fn(() => ({ select: deleteSelect }))
  const deleteRows = vi.fn(() => ({ in: deleteIn }))
  const from = vi.fn(() => ({ update, delete: deleteRows }))
  const getRouteSupabaseClient = vi.fn(async () => ({ from }))

  return {
    requireStaffSession,
    updateSelect,
    updateIn,
    update,
    deleteSelect,
    deleteIn,
    deleteRows,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { DELETE, PATCH } from '@/app/api/travel-package-groups/route'

function request(method: 'PATCH' | 'DELETE', body: unknown) {
  return new Request('http://localhost/api/travel-package-groups', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('travel package group bulk actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'agent-1', email: 'agent@example.com' },
      employee: {
        id: 'agent-1',
        email: 'agent@example.com',
        fullName: 'Package Agent',
        role: 'Master Admin',
        departments: [],
      },
    })
    mocks.updateSelect.mockResolvedValue({
      data: [{ id: GROUP_ONE }, { id: GROUP_TWO }],
      error: null,
    })
    mocks.deleteSelect.mockResolvedValue({
      data: [{ id: GROUP_ONE }, { id: GROUP_TWO }],
      error: null,
    })
  })

  it('archives multiple selected groups together', async () => {
    const response = await PATCH(
      request('PATCH', { ids: [GROUP_ONE, GROUP_TWO], action: 'archive' }) as never,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.updatedCount).toBe(2)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'archived',
        archived_at: expect.any(String),
        updated_by: 'agent-1',
      }),
    )
    expect(mocks.updateIn).toHaveBeenCalledWith('id', [GROUP_ONE, GROUP_TWO])
  })

  it('rejects bulk actions without valid group ids', async () => {
    const response = await PATCH(
      request('PATCH', { ids: ['not-a-group-id'], action: 'archive' }) as never,
    )

    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires an admin role before deleting group containers', async () => {
    mocks.requireStaffSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await DELETE(request('DELETE', { ids: [GROUP_ONE] }) as never)

    expect(response.status).toBe(403)
    expect(mocks.deleteRows).not.toHaveBeenCalled()
  })

  it('deletes only the selected group containers', async () => {
    const response = await DELETE(request('DELETE', { ids: [GROUP_ONE, GROUP_TWO] }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ deletedIds: [GROUP_ONE, GROUP_TWO], deletedCount: 2 })
    expect(mocks.deleteIn).toHaveBeenCalledWith('id', [GROUP_ONE, GROUP_TWO])
  })
})
