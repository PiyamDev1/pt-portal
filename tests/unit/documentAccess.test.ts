import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const results = new Map<string, { data: unknown; error: unknown }>()
  const resultFor = (table: string, column: string) =>
    results.get(`${table}:${column}`) || results.get(table) || { data: null, error: null }
  const eq = vi.fn((table: string, column: string, value: string) => {
    const result = resultFor(table, column)
    return {
      ...result,
      maybeSingle: vi.fn(async () => result),
      table,
      column,
      value,
    }
  })
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

import { documentScopeExists, resolveDocumentScope } from '@/lib/documentAccess'

describe('document scope access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.results.clear()
  })

  it('rejects malformed scope identifiers without database access', async () => {
    await expect(documentScopeExists('../private')).resolves.toBe(false)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('resolves a PKD draft without comparing the text identifier to UUID columns', async () => {
    mocks.results.set('pakistani_passport_drafts', {
      data: { id: 'draft-row', draft_id: 'PKD-ABCDE12345' },
      error: null,
    })

    await expect(documentScopeExists('pkd-abcde12345')).resolves.toBe(true)
    expect(mocks.eq).toHaveBeenCalledWith('pakistani_passport_drafts', 'draft_id', 'PKD-ABCDE12345')
    expect(mocks.from).not.toHaveBeenCalledWith('applicants')
    expect(mocks.from).not.toHaveBeenCalledWith('applications')
  })

  it('includes legacy applicant and converted-draft owners for an application', async () => {
    const applicationId = '11111111-1111-4111-8111-111111111111'
    const applicantId = '22222222-2222-4222-8222-222222222222'
    mocks.results.set('applications:id', {
      data: { id: applicationId, applicant_id: applicantId, family_head_id: applicantId },
      error: null,
    })
    mocks.results.set('pakistani_passport_drafts:converted_application_id', {
      data: [{ id: 'draft-row', draft_id: 'PKD-ABCDE12345' }],
      error: null,
    })

    await expect(resolveDocumentScope(applicationId)).resolves.toEqual({
      exists: true,
      scopeIds: [applicationId, applicantId, 'PKD-ABCDE12345'],
    })
  })

  it('fails closed when scope verification cannot be completed', async () => {
    mocks.results.set('applications', {
      data: null,
      error: { code: 'XX000', message: 'database unavailable' },
    })

    await expect(documentScopeExists('11111111-1111-4111-8111-111111111111')).rejects.toEqual(
      expect.objectContaining({ code: 'XX000' }),
    )
  })
})
