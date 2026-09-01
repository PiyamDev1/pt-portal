import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServiceSupabaseClient: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import {
  recordCustomerServiceLoyaltyEvent,
  registerCustomerLoyaltySourceForCode,
} from '@/lib/customerPortal/loyaltyLifecycleServer'

const SOURCE_ID = '01a04af2-5437-74c2-8d42-2f815c7204d5'

describe('customer loyalty lifecycle server adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: { state: 'pending' }, error: null })
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
  })

  it('registers a customer code through the source-aware RPC', async () => {
    const result = await registerCustomerLoyaltySourceForCode({
      customerCode: ' pym-7k4m-9q2d-h ',
      source: { type: 'ticket', recordId: SOURCE_ID },
      description: 'Manchester to Jeddah ticket',
      points: 125,
    })

    expect(mocks.rpc).toHaveBeenCalledWith('customer_loyalty_register_code_source_v1', {
      p_customer_code: 'PYM-7K4M-9Q2D-H',
      p_source_type: 'ticket',
      p_source_namespace: null,
      p_source_record_id: SOURCE_ID,
      p_description: 'Manchester to Jeddah ticket',
      p_points: 125,
    })
    expect(result).toEqual({
      sourceReference: `ticket.v1:${SOURCE_ID}`,
      activationMilestone: 'issued_and_paid',
      award: { state: 'pending' },
    })
  })

  it('records service evidence through the immutable event RPC', async () => {
    await recordCustomerServiceLoyaltyEvent({
      namespace: 'Visa',
      recordId: SOURCE_ID,
      eventReference: 'visa-paid:receipt-123',
      eventType: 'paid',
      occurredAt: '2026-08-31T12:00:00.000Z',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('customer_loyalty_record_service_event_v1', {
      p_source_namespace: 'visa',
      p_source_record_id: SOURCE_ID,
      p_event_reference: 'visa-paid:receipt-123',
      p_event_type: 'paid',
      p_occurred_at: '2026-08-31T12:00:00.000Z',
    })
  })

  it('rejects malformed customer codes before opening a database client', async () => {
    await expect(
      registerCustomerLoyaltySourceForCode({
        customerCode: 'PYM-0000-0000-0',
        source: { type: 'package', recordId: SOURCE_ID },
        description: 'Package',
        points: 100,
      }),
    ).rejects.toThrow('A valid customer code is required.')
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
