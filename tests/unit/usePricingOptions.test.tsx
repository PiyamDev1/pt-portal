import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/errorHandler', () => ({
  handleApiError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : 'error',
  })),
  formatErrorForDisplay: vi.fn(() => 'formatted error'),
}))

import { toast } from 'sonner'
import { usePricingOptions } from '@/hooks/usePricingOptions'

type QueryResponse = { data: unknown[] | null; error: { code?: string } | null }

function makeSelectQuery(response: QueryResponse, orderCalls: number) {
  let calls = 0
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => {
      calls += 1
      if (calls >= orderCalls) {
        return Promise.resolve(response)
      }
      return query
    }),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  }
  return query
}

function makeSupabaseMock() {
  const responses: Record<string, QueryResponse> = {
    nadra_pricing: {
      data: [{ id: 'n1', cost_price: 10, sale_price: 15, is_active: true, notes: '' }],
      error: null,
    },
    pk_passport_pricing: {
      data: [{ id: 'p1', cost_price: 20, sale_price: 30, is_active: true, notes: '' }],
      error: null,
    },
    gb_passport_pricing: {
      data: [{ id: 'g1', cost_price: 25, sale_price: 35, is_active: true, notes: '' }],
      error: null,
    },
    visa_pricing: {
      data: [{ id: 'v1', cost_price: 12, sale_price: 22, is_active: true, notes: '' }],
      error: null,
    },
  }

  const from = vi.fn((table: string) => {
    if (table in responses) {
      return makeSelectQuery(responses[table], table === 'nadra_pricing' ? 2 : 1)
    }

    return makeSelectQuery({ data: [], error: null }, 1)
  })

  return { from }
}

describe('usePricingOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('fetches pricing data into state buckets', async () => {
    const supabase = makeSupabaseMock()
    const { result } = renderHook(() => usePricingOptions(supabase as never))

    await act(async () => {
      await result.current.fetchPricing()
    })

    expect(result.current.nadraPricing).toHaveLength(1)
    expect(result.current.pkPassPricing).toHaveLength(1)
    expect(result.current.gbPassPricing).toHaveLength(1)
    expect(result.current.visaPricing).toHaveLength(1)
  })

  it('sets edit state through handleEdit', () => {
    const supabase = makeSupabaseMock()
    const { result } = renderHook(() => usePricingOptions(supabase as never))

    act(() => {
      result.current.handleEdit({
        id: 'id-1',
        cost_price: 10,
        sale_price: 20,
        is_active: true,
        notes: 'note',
      } as never)
    })

    expect(result.current.editingId).toBe('id-1')
    expect(result.current.editValues.cost_price).toBe(10)
    expect(result.current.editValues.sale_price).toBe(20)
  })

  it('saves edited pricing and resets editingId', async () => {
    const supabase = makeSupabaseMock()
    const { result } = renderHook(() => usePricingOptions(supabase as never))

    act(() => {
      result.current.setEditingId('row-1')
      result.current.setEditValues({ cost_price: 11, sale_price: 21, is_active: 1, notes: '' })
    })

    await act(async () => {
      await result.current.handleSave('passport')
    })

    expect(result.current.editingId).toBe(null)
    expect(toast.success).toHaveBeenCalledWith('Pricing saved successfully')
  })
})
