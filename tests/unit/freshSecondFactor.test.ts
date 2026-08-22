import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const listFactors = vi.fn()
  const challengeAndVerify = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { mfa: { listFactors, challengeAndVerify } },
  }))

  const backupEq = vi.fn()
  const backupSelect = vi.fn(() => ({ eq: backupEq }))
  const consumedMaybeSingle = vi.fn()
  const consumedSelect = vi.fn(() => ({ maybeSingle: consumedMaybeSingle }))
  const consumedUsedEq = vi.fn(() => ({ select: consumedSelect }))
  const consumedIdEq = vi.fn(() => ({ eq: consumedUsedEq }))
  const update = vi.fn(() => ({ eq: consumedIdEq }))
  const from = vi.fn(() => ({ select: backupSelect, update }))
  const getServiceSupabaseClient = vi.fn(() => ({ from }))
  const compare = vi.fn()

  return {
    listFactors,
    challengeAndVerify,
    getRouteSupabaseClient,
    backupEq,
    backupSelect,
    consumedMaybeSingle,
    consumedSelect,
    consumedUsedEq,
    consumedIdEq,
    update,
    from,
    getServiceSupabaseClient,
    compare,
  }
})

vi.unmock('@/lib/auth/freshSecondFactor')
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare } }))

import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'

describe('verifyFreshSecondFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }], all: [] },
      error: null,
    })
    mocks.challengeAndVerify.mockResolvedValue({ error: null })
    mocks.backupEq.mockResolvedValue({
      data: [{ id: 'backup-1', code_hash: 'hash-1', used: false }],
      error: null,
    })
    mocks.compare.mockResolvedValue(true)
    mocks.consumedMaybeSingle.mockResolvedValue({ data: { id: 'backup-1' }, error: null })
  })

  it('requires a non-empty verification code', async () => {
    const result = await verifyFreshSecondFactor({ userId: 'staff-1', code: '  ' })

    expect(result).toEqual({ verified: false, error: 'Verification code required' })
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
  })

  it('verifies only a registered, verified TOTP factor', async () => {
    const result = await verifyFreshSecondFactor({
      userId: 'staff-1',
      code: '123456',
      method: 'totp',
    })

    expect(result).toEqual({ verified: true, method: 'totp' })
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
  })

  it('normalizes a copied authenticator code and routes auto verification to TOTP', async () => {
    const result = await verifyFreshSecondFactor({
      userId: 'staff-1',
      code: ' 123 456 ',
      method: 'auto',
    })

    expect(result).toEqual({ verified: true, method: 'totp' })
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
    expect(mocks.backupEq).not.toHaveBeenCalled()
  })

  it('consumes a matching backup code with a used=false compare-and-set', async () => {
    const result = await verifyFreshSecondFactor({
      userId: 'staff-1',
      code: 'ABCD-EFGH',
      method: 'backup',
    })

    expect(result).toEqual({ verified: true, method: 'backup' })
    expect(mocks.backupEq).toHaveBeenCalledWith('employee_id', 'staff-1')
    expect(mocks.consumedIdEq).toHaveBeenCalledWith('id', 'backup-1')
    expect(mocks.consumedUsedEq).toHaveBeenCalledWith('used', false)
  })

  it('normalizes a copied backup code and does not submit it as TOTP', async () => {
    const result = await verifyFreshSecondFactor({
      userId: 'staff-1',
      code: ' abcd efgh ',
      method: 'auto',
    })

    expect(result).toEqual({ verified: true, method: 'backup' })
    expect(mocks.compare).toHaveBeenCalledWith('ABCD-EFGH', 'hash-1')
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed when another request consumed the backup code first', async () => {
    mocks.consumedMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await verifyFreshSecondFactor({
      userId: 'staff-1',
      code: 'ABCD-EFGH',
      method: 'backup',
    })

    expect(result).toEqual({ verified: false, error: 'Invalid or used backup code' })
  })
})
