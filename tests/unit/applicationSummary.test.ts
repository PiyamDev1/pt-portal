import { describe, expect, it } from 'vitest'
import {
  buildApplicationSummary,
  getApplicationSourceVisibility,
  totalVisibleApplicationMetrics,
  type ApplicationSourceLoad,
  type ApplicationSourceKey,
  type ApplicationSummaryRecordSeed,
} from '@/lib/applications/summary'

const generatedAt = '2026-09-28T10:00:00.000Z'

function record(
  id: string,
  status: string,
  createdAt: string,
  hasDocuments: boolean | null = true,
): ApplicationSummaryRecordSeed {
  return {
    id,
    applicantName: `Applicant ${id}`,
    serviceLabel: 'Service',
    status,
    createdAt,
    trackingNumber: `REF-${id}`,
    hasDocuments,
  }
}

function sources(
  overrides: Partial<Record<ApplicationSourceKey, ApplicationSourceLoad>> = {},
): Record<ApplicationSourceKey, ApplicationSourceLoad> {
  return {
    nadra: { available: true, records: [] },
    'pak-passport': { available: true, records: [] },
    'gb-passport': { available: true, records: [] },
    visa: { available: true, records: [] },
    ...overrides,
  }
}

describe('application summary', () => {
  it('applies source-owned status rules and de-duplicates attention per record', () => {
    const summary = buildApplicationSummary({
      generatedAt,
      sources: sources({
        nadra: {
          available: true,
          records: [
            record('n-old', 'Pending Submission', '2026-09-19T09:00:00.000Z', false),
            record('n-done', 'Completed', '2026-09-27T12:00:00.000Z'),
          ],
        },
        'pak-passport': {
          available: true,
          records: [record('p-arrived', 'Passport Arrived', '2026-09-26T10:00:00.000Z', false)],
        },
        'gb-passport': {
          available: true,
          records: [record('g-active', 'Submitted', '2026-09-24T10:00:00.000Z')],
        },
        visa: {
          available: true,
          records: [record('v-pending', 'Pending', '2026-09-28T08:00:00.000Z', null)],
        },
      }),
    })

    expect(summary.sources.nadra.metrics).toMatchObject({
      total: 2,
      active: 1,
      done: 1,
      attention: 1,
      statusFollowUp: 1,
      missingDocuments: 0,
      stalled: 1,
      aging: { zeroToTwo: 0, threeToSeven: 0, eightPlus: 1 },
    })
    expect(summary.totals).toMatchObject({
      total: 5,
      active: 4,
      done: 1,
      attention: 3,
      statusFollowUp: 3,
      missingDocuments: 1,
      stalled: 1,
    })
    expect(summary.attentionItems.find((item) => item.id === 'n-old')?.attentionReasons).toEqual([
      'status_follow_up',
      'stalled',
    ])
    expect(
      summary.attentionItems.find((item) => item.id === 'p-arrived')?.attentionReasons,
    ).toEqual(['status_follow_up', 'missing_documents'])
  })

  it('uses deterministic creation-date aging and priority ordering', () => {
    const summary = buildApplicationSummary({
      generatedAt,
      recentLimit: 2,
      attentionLimit: 2,
      sources: sources({
        nadra: {
          available: true,
          records: [
            record('oldest', 'Pending Submission', '2026-09-10T10:00:00.000Z'),
            record('newest', 'Pending Submission', '2026-09-28T09:00:00.000Z'),
            record('middle', 'Submitted', '2026-09-25T10:00:00.000Z'),
          ],
        },
      }),
    })

    expect(summary.ageBasis).toBe('created_at')
    expect(summary.recent.map((item) => item.id)).toEqual(['newest', 'middle'])
    expect(summary.attentionItems.map((item) => item.id)).toEqual(['oldest', 'newest'])
    expect(summary.sources.nadra.metrics.aging).toEqual({
      zeroToTwo: 1,
      threeToSeven: 1,
      eightPlus: 1,
    })
    expect(summary.sources.nadra.metrics.newToday).toBe(1)
    expect(summary.sources.nadra.metrics.newWeek).toBe(2)
  })

  it('keeps available totals while marking a failed source unavailable', () => {
    const summary = buildApplicationSummary({
      generatedAt,
      sources: sources({
        nadra: { available: false, records: [record('ignored', 'Completed', generatedAt)] },
        visa: {
          available: true,
          records: [record('visible', 'Approved', '2026-09-27T10:00:00.000Z', null)],
        },
      }),
    })

    expect(summary.totals.total).toBe(1)
    expect(summary.sources.nadra).toMatchObject({ available: false, metrics: { total: 0 } })
    expect(summary.warnings).toEqual([
      {
        source: 'nadra',
        label: 'NADRA',
        message: 'NADRA applications could not be loaded.',
      },
    ])
  })

  it('uses one role-visibility rule for hub totals and dashboard attention', () => {
    const summary = buildApplicationSummary({
      generatedAt,
      sources: sources({
        nadra: {
          available: true,
          records: [record('n-1', 'Pending Submission', '2026-09-28T08:00:00.000Z')],
        },
        visa: {
          available: true,
          records: [record('v-1', 'Pending', '2026-09-28T08:00:00.000Z', null)],
        },
      }),
    })
    const visibility = getApplicationSourceVisibility('NADRA Agent')

    expect(visibility).toEqual({
      nadra: true,
      'pak-passport': false,
      'gb-passport': false,
      visa: false,
    })
    expect(totalVisibleApplicationMetrics(summary, visibility)).toMatchObject({
      total: 1,
      attention: 1,
    })
  })
})
