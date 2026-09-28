import { describe, expect, it, vi } from 'vitest'
import {
  isExpiredPackageQuoteToClear,
  isPackageFolderNeedingAttention,
  isPackageQuoteReadyForConversion,
  summarizePackageAttention,
  type PackageAttentionFolder,
  type PackageAttentionQuote,
} from '@/lib/packages/attentionSummary'
import { loadPackageAttentionSummary } from '@/lib/packages/attentionSummary.server'

const generatedAt = '2026-09-28T10:00:00.000Z'

function folder(
  overrides: Partial<PackageAttentionFolder> & Pick<PackageAttentionFolder, 'id'>,
): PackageAttentionFolder {
  return {
    id: overrides.id,
    status: 'selected',
    risk_level: 'none',
    next_action_due_at: null,
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

function quote(
  overrides: Partial<PackageAttentionQuote> & Pick<PackageAttentionQuote, 'id'>,
): PackageAttentionQuote {
  return {
    id: overrides.id,
    status: 'shared',
    selected_at: null,
    converted_package_id: null,
    expires_at: '2026-10-28T10:00:00.000Z',
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

describe('Packages Attention Centre summary', () => {
  it('uses the same folder and standalone-quote rules as the Packages Action centre', () => {
    const folders = [
      folder({
        id: 'critical',
        status: 'travelling_soon',
        risk_level: 'critical',
        next_action_due_at: '2026-09-29T09:00:00.000Z',
      }),
      folder({
        id: 'overdue',
        risk_level: 'none',
        next_action_due_at: '2026-09-20T09:00:00.000Z',
      }),
      folder({
        id: 'terminal',
        status: 'closed',
        risk_level: 'critical',
        next_action_due_at: '2026-09-10T09:00:00.000Z',
      }),
    ]
    const quotes = [
      quote({ id: 'selected', selected_at: '2026-09-25T09:00:00.000Z' }),
      quote({ id: 'grouped-selected', selected_at: '2026-09-24T09:00:00.000Z' }),
      quote({ id: 'expired', expires_at: '2026-09-27T09:00:00.000Z' }),
      quote({ id: 'archived', status: 'archived', expires_at: '2026-09-26T09:00:00.000Z' }),
    ]

    expect(isPackageFolderNeedingAttention(folders[0], Date.parse(generatedAt))).toBe(true)
    expect(isPackageQuoteReadyForConversion(quotes[0])).toBe(true)
    expect(isExpiredPackageQuoteToClear(quotes[2], Date.parse(generatedAt))).toBe(true)
    expect(
      summarizePackageAttention({
        folders,
        quotes,
        groupedQuoteIds: ['grouped-selected'],
        generatedAt,
      }),
    ).toEqual({
      available: true,
      attentionCount: 4,
      packageCount: 2,
      overduePackageCount: 1,
      criticalPackageCount: 1,
      highRiskPackageCount: 0,
      selectedQuoteCount: 1,
      expiredQuoteCount: 1,
      oldestAttentionAt: '2026-09-20T09:00:00.000Z',
    })
  })

  it('fails closed when an exact source result is truncated', async () => {
    function query(result: { data: unknown[]; error: null; count: number }) {
      const chain = {
        select: vi.fn(),
        in: vi.fn(),
        neq: vi.fn(),
        not: vi.fn(),
        is: vi.fn(),
        lte: vi.fn(),
        then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      }
      chain.select.mockReturnValue(chain)
      chain.in.mockReturnValue(chain)
      chain.neq.mockReturnValue(chain)
      chain.not.mockReturnValue(chain)
      chain.is.mockReturnValue(chain)
      chain.lte.mockReturnValue(chain)
      return chain
    }

    const from = vi
      .fn()
      .mockReturnValueOnce(query({ data: [], error: null, count: 1 }))
      .mockReturnValueOnce(query({ data: [], error: null, count: 0 }))
      .mockReturnValueOnce(query({ data: [], error: null, count: 0 }))
      .mockReturnValueOnce(query({ data: [], error: null, count: 0 }))

    const summary = await loadPackageAttentionSummary({ from } as never, generatedAt)

    expect(summary.available).toBe(false)
    expect(summary.attentionCount).toBe(0)
    expect(from).toHaveBeenCalledWith('travel_packages')
    expect(from).toHaveBeenCalledWith('travel_package_group_members')
  })
})
