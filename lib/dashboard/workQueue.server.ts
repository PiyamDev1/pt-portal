import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCompanyLmsLiveSummary } from '@/lib/accounting/companySources'
import {
  buildDashboardWorkQueue,
  type BookingQueueSnapshot,
  type DashboardWorkQueue,
  type LmsQueueSnapshot,
  type TicketingQueueSnapshot,
} from '@/lib/dashboard/workQueue'

type LoadDashboardWorkQueueInput = {
  userSupabase: SupabaseClient
  serviceSupabase: SupabaseClient
  visibleModuleIds: Iterable<string>
  employeeId: string
  locationId: string | null
  locationName: string | null
  now?: Date
}

async function loadBookingQueueSnapshot(
  supabase: SupabaseClient,
  locationId: string | null,
  locationName: string | null,
  generatedAt: string,
): Promise<BookingQueueSnapshot> {
  if (!locationId) {
    return {
      available: false,
      pendingCount: 0,
      earliestStartAt: null,
      locationName: locationName || 'Assigned branch',
    }
  }

  const horizon = new Date(new Date(generatedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error, count } = await supabase
    .from('bookings')
    .select('start_time', { count: 'exact' })
    .eq('location_id', locationId)
    .eq('status', 'pending')
    .gte('start_time', generatedAt)
    .lt('start_time', horizon)
    .order('start_time', { ascending: true })
    .limit(1)

  if (error || count === null) {
    return {
      available: false,
      pendingCount: 0,
      earliestStartAt: null,
      locationName: locationName || 'Assigned branch',
    }
  }

  const first = (data || [])[0] as { start_time?: string | null } | undefined
  return {
    available: true,
    pendingCount: count,
    earliestStartAt: first?.start_time || null,
    locationName: locationName || 'Assigned branch',
  }
}

async function loadTicketingQueueSnapshot(
  supabase: SupabaseClient,
  employeeId: string,
  generatedAt: string,
): Promise<TicketingQueueSnapshot> {
  const timeLimitHorizon = new Date(
    new Date(generatedAt).getTime() + 48 * 60 * 60 * 1000,
  ).toISOString()

  const [timeLimits, scheduleChanges] = await Promise.all([
    supabase
      .from('ticket_transactions')
      .select('time_limit_at, ticket_bookings!inner(id)', { count: 'exact' })
      .eq('service_type', 'TK')
      .is('parent_transaction_id', null)
      .eq('operational_status', 'held')
      .not('time_limit_at', 'is', null)
      .lte('time_limit_at', timeLimitHorizon)
      .eq('ticket_bookings.owner_employee_id', employeeId)
      .is('ticket_bookings.archived_at', null)
      .order('time_limit_at', { ascending: true })
      .limit(1),
    supabase
      .from('ticket_itinerary_sectors')
      .select(
        `
          departure_at_utc,
          ticket_bookings!inner(id),
          source_transaction:ticket_transactions!ticket_itinerary_sectors_transaction_booking_fkey!inner(id)
        `,
        { count: 'exact' },
      )
      .eq('is_active', true)
      .is('retired_at', null)
      .in('schedule_status', ['change_marked', 'awaiting_finalisation'])
      .gte('departure_at_utc', generatedAt)
      .eq('ticket_bookings.operational_status', 'issued')
      .is('ticket_bookings.archived_at', null)
      .eq('source_transaction.service_type', 'TK')
      .is('source_transaction.parent_transaction_id', null)
      .eq('source_transaction.operational_status', 'issued')
      .order('departure_at_utc', { ascending: true })
      .limit(1),
  ])

  if (
    timeLimits.error ||
    scheduleChanges.error ||
    timeLimits.count === null ||
    scheduleChanges.count === null
  ) {
    return {
      available: false,
      dueTimeLimitCount: 0,
      earliestTimeLimitAt: null,
      openScheduleChangeCount: 0,
      earliestAffectedDepartureAt: null,
    }
  }

  const firstTimeLimit = (timeLimits.data || [])[0] as { time_limit_at?: string | null } | undefined
  const firstScheduleChange = (scheduleChanges.data || [])[0] as
    | { departure_at_utc?: string | null }
    | undefined

  return {
    available: true,
    dueTimeLimitCount: timeLimits.count,
    earliestTimeLimitAt: firstTimeLimit?.time_limit_at || null,
    openScheduleChangeCount: scheduleChanges.count,
    earliestAffectedDepartureAt: firstScheduleChange?.departure_at_utc || null,
  }
}

async function loadLmsQueueSnapshot(supabase: SupabaseClient): Promise<LmsQueueSnapshot> {
  const summary = await loadCompanyLmsLiveSummary(supabase)
  return {
    available: summary.available,
    overdueAccountCount: summary.overdueAccounts,
    dueSoonAccountCount: summary.dueSoonAccounts,
    loadedAt: summary.loadedAt,
  }
}

export async function loadDashboardWorkQueue(
  input: LoadDashboardWorkQueueInput,
): Promise<DashboardWorkQueue> {
  const generatedAt = (input.now || new Date()).toISOString()
  const visibleModuleIds = new Set(input.visibleModuleIds)
  const [bookings, ticketing, lms] = await Promise.all([
    visibleModuleIds.has('bookings')
      ? loadBookingQueueSnapshot(
          input.userSupabase,
          input.locationId,
          input.locationName,
          generatedAt,
        )
      : undefined,
    visibleModuleIds.has('ticketing')
      ? loadTicketingQueueSnapshot(input.serviceSupabase, input.employeeId, generatedAt)
      : undefined,
    visibleModuleIds.has('lms') ? loadLmsQueueSnapshot(input.serviceSupabase) : undefined,
  ])

  return buildDashboardWorkQueue({
    generatedAt,
    visibleModuleIds,
    bookings,
    ticketing,
    lms,
  })
}
