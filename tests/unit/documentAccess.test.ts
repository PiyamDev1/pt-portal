import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const results = new Map<string, { data: unknown; error: unknown }>()
  const eq = vi.fn((table: string, column: string, value: string) => ({
    maybeSingle: vi.fn(async () => results.get(table) || { data: null, error: null }),
    table,
    column,
    value,
  }))
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: (column: string, value: string) => eq(table, column, value),
    })),
  }))
  return { results, eq, from }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}))

import { documentScopeExists } from '@/lib/documentAccess'

describe('document scope access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.results.clear()
  })

  it('rejects malformed scope identifiers without database access', async () => {
    await expect(documentScopeExists('../private')).resolves.toBe(false)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('accepts a scope backed by an applicant, application, or passport draft', async () => {
    mocks.results.set('pakistani_passport_drafts', { data: { id: 'draft-row' }, error: null })

    await expect(documentScopeExists('ppd-001')).resolves.toBe(true)
    expect(mocks.eq).toHaveBeenCalledWith('pakistani_passport_drafts', 'draft_id', 'PPD-001')
  })

  it('fails closed when scope verification cannot be completed', async () => {
    mocks.results.set('applications', {
      data: null,
      error: { code: 'XX000', message: 'database unavailable' },
    })

    await expect(documentScopeExists('scope-1')).rejects.toEqual(
      expect.objectContaining({ code: 'XX000' }),
    )
  })
})
