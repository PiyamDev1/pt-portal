import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const originalActor = process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID

const mocks = vi.hoisted(() => ({
  requireCronAuthorization: vi.fn(),
  rpc: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/security/cronAuth.server', () => ({
  requireCronAuthorization: mocks.requireCronAuthorization,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET as processCommissions } from '@/app/api/cron/commissions/process/route'

describe('Commission scheduled shadow processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID = ACTOR_ID
    mocks.requireCronAuthorization.mockReturnValue(null)
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'commission_schema_status') {
        return { data: { ready: true, version: 2026082902, mode: 'shadow' }, error: null }
      }
      if (name === 'commission_process_shadow_2026082902') {
        return {
          data: { processedEvents: 7, heldEvents: 1, nonPayable: true },
          error: null,
        }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
  })

  afterAll(() => {
    if (originalActor === undefined) delete process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID
    else process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID = originalActor
  })

  it('runs one bounded daily batch with a configured audit actor', async () => {
    const response = await processCommissions(
      new Request('http://localhost/api/cron/commissions/process'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      processedEvents: 7,
      heldEvents: 1,
      nonPayable: true,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('commission_process_shadow_2026082902', {
      p_actor_employee_id: ACTOR_ID,
      p_limit: 200,
      p_request_key: expect.stringMatching(/^commission-cron:\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('fails closed without a valid configured employee UUID', async () => {
    process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID = 'not-an-employee-id'
    const response = await processCommissions(
      new Request('http://localhost/api/cron/commissions/process'),
    )
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed when processor capability 2902 is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082901, mode: 'shadow' },
      error: null,
    })
    const response = await processCommissions(
      new Request('http://localhost/api/cron/commissions/process'),
    )
    expect(response.status).toBe(503)
  })
})
