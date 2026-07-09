import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperAdminSession = vi.fn()
  const getServerControlConfig = vi.fn()
  const getServerControlStatus = vi.fn()
  const runServerControlAction = vi.fn()
  const compare = vi.fn()

  const selectEq = vi.fn()
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  const getSupabaseClient = vi.fn(() => ({ from }))

  const challengeAndVerify = vi.fn()
  const listFactors = vi.fn()
  const getRouteSupabaseClient = vi.fn(() => ({
    auth: {
      mfa: {
        listFactors,
        challengeAndVerify,
      },
    },
  }))

  return {
    requireSuperAdminSession,
    getServerControlConfig,
    getServerControlStatus,
    runServerControlAction,
    compare,
    selectEq,
    select,
    updateEq,
    update,
    from,
    getSupabaseClient,
    challengeAndVerify,
    listFactors,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireSuperAdminSession: mocks.requireSuperAdminSession,
}))

vi.mock('@/lib/serverControl', () => ({
  getServerControlConfig: mocks.getServerControlConfig,
  getServerControlStatus: mocks.getServerControlStatus,
  runServerControlAction: mocks.runServerControlAction,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: mocks.compare,
  },
}))

import { GET, POST } from '@/app/api/admin/server-control/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/admin/server-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('admin server control route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdminSession.mockResolvedValue({
      authorized: true,
      user: { id: 'super-1', email: 'super@example.com' },
    })
    mocks.getServerControlConfig.mockReturnValue({
      configured: true,
      token: 'token',
      serverId: '123',
      label: 'Hetzner production server',
    })
    mocks.getServerControlStatus.mockResolvedValue({
      configured: true,
      label: 'Hetzner production server',
      checkedAt: '2026-07-03T00:00:00.000Z',
      server: { id: 123, name: 'pt-host', status: 'running' },
      services: [],
    })
    mocks.selectEq.mockResolvedValue({
      data: [{ id: 'backup-1', code_hash: 'hash-1', used: false }],
      error: null,
    })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.compare.mockResolvedValue(true)
    mocks.runServerControlAction.mockResolvedValue({
      ok: true,
      action: 'restart',
      providerAction: {
        id: 44,
        command: 'reboot_server',
        status: 'running',
      },
    })
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }], all: [] },
      error: null,
    })
    mocks.challengeAndVerify.mockResolvedValue({ error: null })
  })

  it('passes through unauthorized GET response', async () => {
    mocks.requireSuperAdminSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
  })

  it('returns Hetzner server status for Super Admins', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.server.name).toBe('pt-host')
    expect(mocks.getServerControlStatus).toHaveBeenCalled()
  })

  it('requires server control configuration before verification', async () => {
    mocks.getServerControlConfig.mockReturnValueOnce({
      configured: false,
      token: '',
      serverId: '',
      label: 'Hetzner production server',
    })

    const response = await POST(
      makeRequest({
        action: 'restart',
        verificationMethod: 'backup',
        verificationCode: 'ABCD-EFGH',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.error).toBe('Server control is not configured')
    expect(mocks.compare).not.toHaveBeenCalled()
    expect(mocks.runServerControlAction).not.toHaveBeenCalled()
  })

  it('runs a power action after backup-code verification', async () => {
    const response = await POST(
      makeRequest({
        action: 'restart',
        verificationMethod: 'backup',
        verificationCode: 'ABCD-EFGH',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.providerAction.id).toBe(44)
    expect(mocks.compare).toHaveBeenCalledWith('ABCD-EFGH', 'hash-1')
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'backup-1')
    expect(mocks.runServerControlAction).toHaveBeenCalledWith('restart')
  })

  it('runs a power action after TOTP verification', async () => {
    const response = await POST(
      makeRequest({
        action: 'start',
        verificationMethod: 'totp',
        verificationCode: '123456',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
    expect(mocks.runServerControlAction).toHaveBeenCalledWith('start')
  })

  it('rejects invalid backup codes without running the action', async () => {
    mocks.compare.mockResolvedValueOnce(false)

    const response = await POST(
      makeRequest({
        action: 'stop',
        verificationMethod: 'backup',
        verificationCode: 'BAD',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Invalid or used backup code')
    expect(mocks.runServerControlAction).not.toHaveBeenCalled()
  })
})
