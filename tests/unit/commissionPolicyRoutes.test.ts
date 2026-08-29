import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const POLICY_ID = '50000000-0000-4000-8000-000000000001'
const EXCEPTION_ID = '60000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireCommissionPolicyAccess: vi.fn(),
  rpc: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/commissions/apiAuth', () => ({
  requireCommissionPolicyAccess: mocks.requireCommissionPolicyAccess,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST as createPolicy } from '@/app/api/commissions/policies/route'
import { POST as preview } from '@/app/api/commissions/preview/route'
import { POST as processShadow } from '@/app/api/commissions/process/route'
import { POST as retryException } from '@/app/api/commissions/exceptions/[id]/retry/route'

function request(path: string, body: unknown, key: string | null = 'commission-request-0001') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Idempotency-Key'] = key
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('Commission policy mutation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireCommissionPolicyAccess.mockResolvedValue({
      authorized: true,
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'Admin' },
      canManageGrants: false,
    })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'commission_schema_status') {
        return { data: { ready: true, version: 2026082902, mode: 'shadow' }, error: null }
      }
      if (name === 'commission_create_policy_2026082901') {
        return {
          data: { id: POLICY_ID, name: 'Ticketing Sales Team' },
          error: null,
        }
      }
      if (name === 'commission_preview_component_2026082901') {
        return {
          data: {
            previewMode: 'synthetic_non_authoritative',
            result: { amountGbp: 250 },
          },
          error: null,
        }
      }
      if (name === 'commission_process_shadow_2026082902') {
        return {
          data: { processedEvents: 3, heldEvents: 0, nonPayable: true },
          error: null,
        }
      }
      if (name === 'commission_retry_exception_2026082902') {
        return { data: { id: EXCEPTION_ID, queued: true }, error: null }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
  })

  it('derives the actor and creates a policy through the audited RPC', async () => {
    const response = await createPolicy(
      request('/api/commissions/policies', {
        name: 'Ticketing Sales Team',
        description: 'Primary ticket and sales bonus policy',
      }),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ id: POLICY_ID })
    expect(mocks.rpc).toHaveBeenCalledWith('commission_create_policy_2026082901', {
      p_actor_employee_id: ACTOR_ID,
      p_rule_name: 'Ticketing Sales Team',
      p_description: 'Primary ticket and sales bonus policy',
      p_request_key: 'commission-request-0001',
    })
  })

  it('authenticates first and rejects caller identities or missing idempotency keys', async () => {
    mocks.requireCommissionPolicyAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    expect(
      (await createPolicy(request('/api/commissions/policies', { name: 'Ticketing Sales Team' })))
        .status,
    ).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()

    expect(
      (
        await createPolicy(
          request('/api/commissions/policies', {
            name: 'Ticketing Sales Team',
            actingEmployeeId: ACTOR_ID,
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await createPolicy(
          request('/api/commissions/policies', { name: 'Ticketing Sales Team' }, null),
        )
      ).status,
    ).toBe(400)
  })

  it('fails closed when the Commission capability is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082900, mode: 'shadow' },
      error: null,
    })
    expect(
      (await createPolicy(request('/api/commissions/policies', { name: 'Ticketing Sales Team' })))
        .status,
    ).toBe(503)
  })

  it('audits a strict synthetic fixed-per-ticket preview without employee identity input', async () => {
    const body = {
      component: {
        componentType: 'fixed_per_unit',
        sourceVariable: 'passenger_ticket_count',
        recipientRole: 'primary',
        rateValue: '5.00',
        eligibleServices: [],
        config: {},
      },
      variables: { units: 50, incompleteInputCount: 0 },
    }
    const response = await preview(request('/api/commissions/preview', body))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      previewMode: 'synthetic_non_authoritative',
      result: { amountGbp: 250 },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('commission_preview_component_2026082901', {
      p_actor_employee_id: ACTOR_ID,
      p_component: body.component,
      p_variables: body.variables,
      p_request_key: 'commission-request-0001',
    })
  })

  it('runs a bounded non-payable shadow batch through the service-only RPC', async () => {
    const response = await processShadow(request('/api/commissions/process', { limit: 100 }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      processedEvents: 3,
      heldEvents: 0,
      nonPayable: true,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('commission_process_shadow_2026082902', {
      p_actor_employee_id: ACTOR_ID,
      p_limit: 100,
      p_request_key: 'commission-request-0001',
    })

    expect((await processShadow(request('/api/commissions/process', { limit: 201 }))).status).toBe(
      400,
    )
  })

  it('queues an audited retry for a strict exception request', async () => {
    const response = await retryException(
      request(`/api/commissions/exceptions/${EXCEPTION_ID}/retry`, {}),
      { params: Promise.resolve({ id: EXCEPTION_ID }) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: EXCEPTION_ID, queued: true })
    expect(mocks.rpc).toHaveBeenCalledWith('commission_retry_exception_2026082902', {
      p_actor_employee_id: ACTOR_ID,
      p_exception_id: EXCEPTION_ID,
      p_request_key: 'commission-request-0001',
    })

    expect(
      (
        await retryException(
          request(`/api/commissions/exceptions/${EXCEPTION_ID}/retry`, { reason: 'override' }),
          { params: Promise.resolve({ id: EXCEPTION_ID }) },
        )
      ).status,
    ).toBe(400)
  })
})
