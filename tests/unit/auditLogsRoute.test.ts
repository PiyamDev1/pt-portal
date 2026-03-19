import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { GET, POST } from '@/app/api/lms/audit-logs/route'

describe('/api/lms/audit-logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns 400 when accountId is missing', async () => {
    const request = new Request('http://localhost/api/lms/audit-logs')

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Account ID required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('GET returns formatted logs and total count', async () => {
    const range = vi.fn(async () => ({
      data: [
        {
          id: 'log-1',
          user_id: 'u-1',
          action: 'UPDATE',
          entity_type: 'loan',
          entity_id: 'acct-1',
          changes: { balance: 100 },
          created_at: '2026-03-17T10:00:00.000Z',
          employees: [{ full_name: 'Alex Doe', email: 'alex@example.com' }],
        },
        {
          id: 'log-2',
          user_id: 'u-2',
          action: 'CREATE',
          entity_type: 'loan',
          entity_id: 'acct-1',
          changes: null,
          created_at: '2026-03-17T11:00:00.000Z',
          employees: { full_name: 'Jamie Roe', email: 'jamie@example.com' },
        },
      ],
      error: null,
      count: 2,
    }))

    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'audit_logs') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { select }
    })

    const request = new Request(
      'http://localhost/api/lms/audit-logs?accountId=acct-1&limit=2&offset=0',
    )

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.total).toBe(2)
    expect(payload.logs).toHaveLength(2)
    expect(payload.logs[0].employee).toEqual({ name: 'Alex Doe', email: 'alex@example.com' })
    expect(payload.logs[1].employee).toEqual({ name: 'Jamie Roe', email: 'jamie@example.com' })
    expect(range).toHaveBeenCalledWith(0, 1)
  })

  it('GET returns 500 when query fails', async () => {
    const range = vi.fn(async () => ({
      data: null,
      error: { message: 'query failed' },
      count: null,
    }))
    const order = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation(() => ({ select }))

    const request = new Request('http://localhost/api/lms/audit-logs?accountId=acct-1')

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('query failed')
  })

  it('POST returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/lms/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Missing required fields' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('POST inserts audit log and uppercases action', async () => {
    const single = vi.fn(async () => ({
      data: { id: 'log-new', action: 'UPDATE' },
      error: null,
    }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn<(value: Record<string, unknown>) => { select: typeof select }>(() => ({
      select,
    }))

    mocks.from.mockImplementation(() => ({ insert }))

    const request = new Request('http://localhost/api/lms/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u-1',
        action: 'update',
        entityType: 'loan',
        entityId: 'acct-1',
        changes: { status: 'active' },
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.log).toEqual({ id: 'log-new', action: 'UPDATE' })
    expect(insert).toHaveBeenCalledTimes(1)

    const inserted = (insert.mock.calls.at(0)?.[0] ?? null) as Record<string, unknown> | null
    expect(inserted).not.toBeNull()
    expect(inserted?.user_id).toBe('u-1')
    expect(inserted?.action).toBe('UPDATE')
    expect(inserted?.entity_type).toBe('loan')
    expect(inserted?.entity_id).toBe('acct-1')
    expect(inserted?.changes).toEqual({ status: 'active' })
    expect(typeof inserted?.created_at).toBe('string')
  })

  it('POST returns 500 when insert fails', async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { message: 'insert failed' },
    }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))

    mocks.from.mockImplementation(() => ({ insert }))

    const request = new Request('http://localhost/api/lms/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u-1',
        action: 'create',
        entityType: 'loan',
        entityId: 'acct-1',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('insert failed')
  })
})
