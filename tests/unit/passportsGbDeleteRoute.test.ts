import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const gbSingle = vi.fn()
  const gbEq = vi.fn(() => ({ single: gbSingle }))
  const gbSelect = vi.fn(() => ({ eq: gbEq }))
  const gbDeleteEq = vi.fn()
  const gbDelete = vi.fn(() => ({ eq: gbDeleteEq }))
  const gbOtherAppsEq = vi.fn()
  const gbOtherAppsSelect = vi.fn(() => ({ eq: gbOtherAppsEq }))

  const logInsert = vi.fn()
  const appDeleteEq = vi.fn()
  const appDelete = vi.fn(() => ({ eq: appDeleteEq }))
  const nadraEq = vi.fn()
  const nadraSelect = vi.fn(() => ({ eq: nadraEq }))
  const pakEq = vi.fn()
  const pakSelect = vi.fn(() => ({ eq: pakEq }))
  const applicantDeleteEq = vi.fn()
  const applicantDelete = vi.fn(() => ({ eq: applicantDeleteEq }))

  const from = vi.fn((table: string) => {
    if (table === 'british_passport_applications') {
      return { select: gbSelect, delete: gbDelete }
    }
    if (table === 'deletion_logs') return { insert: logInsert }
    if (table === 'applications') return { delete: appDelete }
    if (table === 'nadra_services') return { select: nadraSelect }
    if (table === 'pak_passport_applications') return { select: pakSelect }
    if (table === 'applicants') return { delete: applicantDelete }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    gbSingle,
    gbEq,
    gbSelect,
    gbDelete,
    gbDeleteEq,
    gbOtherAppsEq,
    gbOtherAppsSelect,
    logInsert,
    appDelete,
    appDeleteEq,
    nadraEq,
    nadraSelect,
    pakEq,
    pakSelect,
    applicantDelete,
    applicantDeleteEq,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/gb/delete/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/gb/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/gb/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'british_passport_applications') {
        return {
          select: vi.fn(() => ({ eq: mocks.gbEq })),
          delete: vi.fn(() => ({ eq: mocks.gbDeleteEq })),
        }
      }
      if (table === 'deletion_logs') return { insert: mocks.logInsert }
      if (table === 'applications') return { delete: vi.fn(() => ({ eq: mocks.appDeleteEq })) }
      if (table === 'nadra_services') return { select: vi.fn(() => ({ eq: mocks.nadraEq })) }
      if (table === 'pak_passport_applications')
        return { select: vi.fn(() => ({ eq: mocks.pakEq })) }
      if (table === 'applicants') return { delete: vi.fn(() => ({ eq: mocks.applicantDeleteEq })) }
      return {}
    })
  })

  it('returns 403 when auth code is missing', async () => {
    const res = await POST(makeRequest({ id: 'gb-1', userId: 'u-1' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/auth code required/i)
  })

  it('returns 404 when record is not found', async () => {
    mocks.gbEq.mockReturnValue({ single: mocks.gbSingle })
    mocks.gbSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest({ id: 'gb-1', authCode: 'ok', userId: 'u-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 500 when deletion log insert fails', async () => {
    mocks.gbEq.mockReturnValue({ single: mocks.gbSingle })
    mocks.gbSingle.mockResolvedValue({ data: { id: 'gb-1' }, error: null })
    mocks.logInsert.mockResolvedValue({ error: { message: 'log fail' } })

    const res = await POST(makeRequest({ id: 'gb-1', authCode: 'ok', userId: 'u-1' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 on successful delete flow', async () => {
    mocks.gbEq.mockReturnValue({ single: mocks.gbSingle })
    mocks.gbSingle.mockResolvedValue({
      data: { id: 'gb-1', application_id: 'app-1', applicant_id: 'a-1' },
      error: null,
    })
    mocks.logInsert.mockResolvedValue({ error: null })
    mocks.gbDeleteEq.mockResolvedValue({ error: null })
    mocks.appDeleteEq.mockResolvedValue({ error: null })
    mocks.nadraEq.mockResolvedValue({ data: [{ id: 'n-1' }], error: null })
    mocks.pakEq.mockResolvedValue({ data: [], error: null })

    const res = await POST(makeRequest({ id: 'gb-1', authCode: 'ok', userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ deletedPassportId: 'gb-1' })
  })
})
