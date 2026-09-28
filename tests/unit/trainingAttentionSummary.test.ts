import { describe, expect, it, vi } from 'vitest'
import {
  loadTrainingAttentionSummary,
  summarizeTrainingAttention,
} from '@/lib/training/attentionSummary.server'

const generatedAt = '2026-09-28T10:00:00.000Z'

describe('Training Attention Centre summary', () => {
  it('de-duplicates assignments across due-date and certificate signals', () => {
    const summary = summarizeTrainingAttention(
      [
        {
          id: 'overdue',
          status: 'assigned',
          due_date: '2026-09-20',
          certificate_expires_at: null,
          created_at: '2026-09-01T09:00:00.000Z',
        },
        {
          id: 'due-soon',
          status: 'in_progress',
          due_date: '2026-10-02',
          certificate_expires_at: null,
          created_at: '2026-09-15T09:00:00.000Z',
        },
        {
          id: 'expired-certificate',
          status: 'completed',
          due_date: null,
          certificate_expires_at: '2026-09-25T09:00:00.000Z',
          created_at: '2026-01-01T09:00:00.000Z',
        },
        {
          id: 'expiring-certificate',
          status: 'completed',
          due_date: null,
          certificate_expires_at: '2026-10-10T09:00:00.000Z',
          created_at: '2026-02-01T09:00:00.000Z',
        },
        {
          id: 'current-certificate',
          status: 'completed',
          due_date: null,
          certificate_expires_at: '2027-09-28T09:00:00.000Z',
          created_at: '2026-03-01T09:00:00.000Z',
        },
      ],
      generatedAt,
      'Europe/London',
    )

    expect(summary).toEqual({
      available: true,
      attentionCount: 4,
      incompleteCount: 2,
      overdueCount: 1,
      dueSoonCount: 1,
      expiredCertificateCount: 1,
      expiringCertificateCount: 1,
      oldestAttentionAt: '2026-09-20T00:00:00.000Z',
    })
  })

  it('loads only the current employee and active-course enrolments', async () => {
    const result = {
      data: [
        {
          id: 'assigned',
          status: 'assigned',
          due_date: null,
          certificate_expires_at: null,
          created_at: '2026-09-20T09:00:00.000Z',
        },
      ],
      error: null,
    }
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue(result),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    const from = vi.fn().mockReturnValue(query)

    const summary = await loadTrainingAttentionSummary({ from } as never, {
      employeeId: 'staff-1',
      generatedAt,
      timezone: 'Europe/London',
    })

    expect(summary.attentionCount).toBe(1)
    expect(query.eq).toHaveBeenCalledWith('employee_id', 'staff-1')
    expect(query.eq).toHaveBeenCalledWith('training_courses.is_active', true)
  })
})
