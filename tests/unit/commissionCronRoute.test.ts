import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    mocks.requireCronAuthorization.mockReturnValue(null)
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'commission_schema_status') {
        return { data: { ready: true, version: 2026082903, mode: 'shadow' }, error: null }
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

  it('runs one bounded daily batch as the audited system worker', async () => {
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
      p_actor_employee_id: null,
      p_limit: 200,
      p_request_key: expect.stringMatching(/^commission-cron:\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('fails closed when department/system capability 2903 is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082902, mode: 'shadow' },
      error: null,
    })
    const response = await processCommissions(
      new Request('http://localhost/api/cron/commissions/process'),
    )
    expect(response.status).toBe(503)
  })
})
