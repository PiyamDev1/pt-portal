import { describe, expect, it, vi } from 'vitest'
import { loadFrappeAttentionSummary } from '@/lib/integrations/frappe/attentionSummary.server'

function queryResult(result: { data?: unknown[]; count?: number | null; error?: unknown }) {
  const resolved = {
    data: result.data || [],
    count: result.count ?? null,
    error: result.error || null,
  }
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: typeof resolved) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  return query
}

describe('Frappe Attention Centre summary', () => {
  it('returns durable integration problems without calling the external service', async () => {
    const outbox = queryResult({
      count: 2,
      data: [{ created_at: '2026-09-20T09:00:00.000Z' }],
    })
    const inbox = queryResult({
      count: 1,
      data: [{ received_at: '2026-09-21T09:00:00.000Z' }],
    })
    const conflicts = queryResult({
      count: 3,
      data: [{ created_at: '2026-09-22T09:00:00.000Z' }],
    })
    const syncState = queryResult({
      data: [
        { domain: 'leave', health_status: 'failed', updated_at: '2026-09-23T09:00:00.000Z' },
        {
          domain: 'attendance',
          health_status: 'degraded',
          updated_at: '2026-09-24T09:00:00.000Z',
        },
      ],
    })
    const from = vi.fn((table: string) => {
      if (table === 'integration_outbox') return outbox
      if (table === 'integration_inbox') return inbox
      if (table === 'integration_conflicts') return conflicts
      return syncState
    })

    const summary = await loadFrappeAttentionSummary({ from } as never)

    expect(summary).toEqual({
      available: true,
      outboxDeadLetterCount: 2,
      failedInboxCount: 1,
      openConflictCount: 3,
      failedDomainCount: 1,
      degradedDomainCount: 1,
      oldestProblemAt: '2026-09-20T09:00:00.000Z',
    })
    expect(outbox.eq).toHaveBeenCalledWith('status', 'dead_letter')
    expect(inbox.eq).toHaveBeenCalledWith('source', 'frappe')
    expect(inbox.in).toHaveBeenCalledWith('status', ['failed', 'dead_letter'])
    expect(conflicts.eq).toHaveBeenCalledWith('status', 'open')
    expect(syncState.in).toHaveBeenCalledWith('health_status', ['degraded', 'failed'])
  })

  it('fails closed instead of presenting a query failure as all clear', async () => {
    const failed = queryResult({ error: { message: 'schema unavailable' } })
    const from = vi.fn(() => failed)

    const summary = await loadFrappeAttentionSummary({ from } as never)

    expect(summary.available).toBe(false)
    expect(summary.outboxDeadLetterCount).toBe(0)
  })
})
