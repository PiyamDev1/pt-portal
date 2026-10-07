import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import type { GeneratedReceipt } from '@/lib/services/receiptGenerator'
import { persistGeneratedReceipt } from '@/lib/services/receiptStore'

function createQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
  }

  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.upsert.mockReturnValue(query)
  return query
}

const receipt = {
  id: '2f9114eb-1c3c-555e-b72c-f63bff5574a2',
  receiptNumber: 'RC-12345678-261007-ABCDEF',
  serviceType: 'visa',
  receiptType: 'submission',
} as GeneratedReceipt

describe('persistGeneratedReceipt idempotency', () => {
  let query: ReturnType<typeof createQuery>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    query = createQuery()
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reuses an existing receipt for the same service event', async () => {
    const existingReceipt = { ...receipt, id: 'legacy-receipt-id' }
    query.maybeSingle.mockResolvedValueOnce({
      data: { payload: existingReceipt },
      error: null,
    })

    const result = await persistGeneratedReceipt({
      receipt,
      serviceRecordId: 'visa-record-1',
    })

    expect(result).toEqual({ persisted: true, receipt: existingReceipt })
    expect(query.upsert).not.toHaveBeenCalled()
  })

  it('inserts once using the stable receipt UUID and ignores concurrent duplicates', async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { payload: receipt }, error: null })

    const result = await persistGeneratedReceipt({
      receipt,
      serviceRecordId: 'visa-record-1',
    })

    expect(result).toEqual({ persisted: true, receipt })
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: receipt.id, service_record_id: 'visa-record-1' }),
      { onConflict: 'id', ignoreDuplicates: true },
    )
  })

  it('reads the winning row when another request inserted the same identity first', async () => {
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { payload: receipt }, error: null })

    const result = await persistGeneratedReceipt({
      receipt,
      serviceRecordId: 'visa-record-1',
    })

    expect(result).toEqual({ persisted: true, receipt })
    expect(query.eq).toHaveBeenLastCalledWith('id', receipt.id)
  })
})
