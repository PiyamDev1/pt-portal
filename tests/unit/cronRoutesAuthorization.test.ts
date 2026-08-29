import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCronAuthorization: vi.fn(
    () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ),
  dispatchOutboxBatch: vi.fn(),
  queueRecentTimeclockAttendance: vi.fn(),
  getSupabaseClient: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/security/cronAuth.server', () => ({
  requireCronAuthorization: mocks.requireCronAuthorization,
}))

vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  dispatchOutboxBatch: mocks.dispatchOutboxBatch,
  queueRecentTimeclockAttendance: mocks.queueRecentTimeclockAttendance,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

vi.mock('@/lib/bookingEmail', () => ({ sendBookingEmail: vi.fn() }))
vi.mock('@/lib/bookingPersistence', () => ({ storeBookingEmailAttempt: vi.fn() }))
vi.mock('@/lib/issueReportStorage', () => ({ deleteIssueArtifact: vi.fn() }))

import { GET as sendBookingReminders } from '@/app/api/cron/bookings/reminders/route'
import { GET as dispatchFrappeOutbox } from '@/app/api/cron/integrations/frappe/outbox/route'
import { GET as backfillFrappeAttendance } from '@/app/api/cron/integrations/frappe/timeclock-attendance/route'
import { GET as cleanupIssueReports } from '@/app/api/cron/issue-reports/cleanup/route'
import { GET as cleanupPassportDrafts } from '@/app/api/cron/passports/pak/drafts-cleanup/route'
import { GET as processCommissions } from '@/app/api/cron/commissions/process/route'
import { GET as monitorTicketingFlights } from '@/app/api/cron/ticketing/flight-monitor/route'
import { GET as processTicketingTimeLimits } from '@/app/api/cron/ticketing/time-limits/route'

describe('cron route authorization wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('checks the shared cron guard before each scheduled job runs', async () => {
    const handlers = [
      sendBookingReminders,
      dispatchFrappeOutbox,
      backfillFrappeAttendance,
      cleanupIssueReports,
      cleanupPassportDrafts,
      processCommissions,
      monitorTicketingFlights,
      processTicketingTimeLimits,
    ]

    for (const handler of handlers) {
      const response = await handler(new Request('http://localhost/api/cron/test'))
      expect(response.status).toBe(401)
    }

    expect(mocks.requireCronAuthorization).toHaveBeenCalledTimes(handlers.length)
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.dispatchOutboxBatch).not.toHaveBeenCalled()
    expect(mocks.queueRecentTimeclockAttendance).not.toHaveBeenCalled()
  })
})
