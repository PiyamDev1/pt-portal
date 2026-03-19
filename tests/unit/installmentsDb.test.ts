import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import * as installmentsDb from '@/lib/installmentsDb'

describe('installmentsDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('returns false when Supabase env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL

    const result = await installmentsDb.ensureInstallmentsTableExists()

    expect(result).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('creates installment records when table exists', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: 'exists' }], error: null })
    const selectExists = vi.fn(() => ({ limit }))
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null })
    const insert = vi.fn((rows: Array<Record<string, unknown>>) => ({ select }))
    const from = vi.fn(() => ({
      select: selectExists,
      insert,
    }))

    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await installmentsDb.createInstallmentRecords('tx-1', 300, '2026-03-01', 3)

    expect(result).toEqual([{ id: 'row-1' }])
    expect(from).toHaveBeenCalledWith('loan_installments')

    const inserted = (insert.mock.calls.at(0)?.[0] ?? []) as Array<Record<string, unknown>>
    expect(Array.isArray(inserted)).toBe(true)
    expect(inserted).toHaveLength(3)
    expect(inserted[0]?.amount).toBe(100)
    expect(inserted[0]?.installment_number).toBe(1)
  })

  it('creates detailed installment records from a plan', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: 'exists' }], error: null })
    const selectExists = vi.fn(() => ({ limit }))
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'd-1' }, { id: 'd-2' }], error: null })
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({
      select: selectExists,
      insert,
    }))

    vi.mocked(createClient).mockReturnValue({ from } as never)

    const plan = [
      { dueDate: '2026-04-01', amount: 120 },
      { dueDate: '2026-05-01', amount: 180 },
    ]

    const result = await installmentsDb.createDetailedInstallmentRecords('tx-2', plan)

    expect(result).toEqual([{ id: 'd-1' }, { id: 'd-2' }])
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
