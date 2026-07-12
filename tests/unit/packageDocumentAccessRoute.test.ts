import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()

  const existingSingle = vi.fn()
  const existingEq = vi.fn(() => ({ single: existingSingle }))
  const existingSelect = vi.fn(() => ({ eq: existingEq }))

  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))

  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') {
      return {
        select: existingSelect,
        update,
      }
    }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    existingSingle,
    existingEq,
    existingSelect,
    updateSingle,
    updateSelect,
    updateEq,
    update,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH } from '@/app/api/travel-packages/[id]/documents/access/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/travel-packages/package-1/documents/access', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('travel package document access route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.existingSingle.mockResolvedValue({
      data: { id: 'package-1', document_access_token: 'existing-token' },
      error: null,
    })
    mocks.updateSingle.mockResolvedValue({
      data: {
        id: 'package-1',
        document_access_token: 'existing-token',
        document_access_enabled: true,
        document_access_expires_at: '2026-09-01T10:00:00.000Z',
        document_release_status: 'released',
      },
      error: null,
    })
  })

  it('requires an authenticated agent', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await PATCH(makeRequest({ enabled: true }) as never, {
      params: Promise.resolve({ id: 'package-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('rejects a past portal expiry', async () => {
    const response = await PATCH(
      makeRequest({ enabled: true, expiresAt: '2020-01-01T10:00:00.000Z' }) as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('expiry')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('enables access using the requested future expiry', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const response = await PATCH(makeRequest({ enabled: true, expiresAt }) as never, {
      params: Promise.resolve({ id: 'package-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.access.document_access_enabled).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        document_access_enabled: true,
        document_access_token: 'existing-token',
        document_access_expires_at: expiresAt,
        document_release_status: 'released',
      }),
    )
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'package-1')
  })

  it('revokes access without deleting the existing token', async () => {
    mocks.updateSingle.mockResolvedValueOnce({
      data: {
        id: 'package-1',
        document_access_token: 'existing-token',
        document_access_enabled: false,
        document_access_expires_at: null,
        document_release_status: 'revoked',
      },
      error: null,
    })

    const response = await PATCH(makeRequest({ enabled: false }) as never, {
      params: Promise.resolve({ id: 'package-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.access.document_access_enabled).toBe(false)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        document_access_enabled: false,
        document_access_token: 'existing-token',
        document_access_expires_at: null,
        document_release_status: 'revoked',
      }),
    )
  })
})
