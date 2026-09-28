import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCompanyLmsLiveSummary } from '@/lib/accounting/companySources'
import {
  APPLICATION_SOURCE_KEYS,
  getApplicationSourceVisibility,
  totalVisibleApplicationMetrics,
} from '@/lib/applications/summary'
import { loadApplicationSummary } from '@/lib/applications/summary.server'
import {
  buildDashboardWorkQueue,
  type ApplicationsQueueSnapshot,
  type BookingQueueSnapshot,
  type DashboardWorkQueue,
  type FrappeQueueSnapshot,
  type LmsQueueSnapshot,
  type PackageQueueSnapshot,
  type PosQueueSnapshot,
  type TicketingQueueSnapshot,
  type TrainingQueueSnapshot,
} from '@/lib/dashboard/workQueue'
import { loadFrappeAttentionSummary } from '@/lib/integrations/frappe/attentionSummary.server'
import { loadPackageAttentionSummary } from '@/lib/packages/attentionSummary.server'
import { loadPosReconciliationAttentionSummary } from '@/lib/pos/reconciliationSummary.server'
import { loadTrainingAttentionSummary } from '@/lib/training/attentionSummary.server'

type LoadDashboardWorkQueueInput = {
  userSupabase: SupabaseClient
  serviceSupabase: SupabaseClient
  visibleModuleIds: Iterable<string>
  employeeId: string
  locationId: string | null
  locationName: string | null
  locationTimezone: string | null
  roleName: string
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

async function loadApplicationsQueueSnapshot(
  supabase: SupabaseClient,
  generatedAt: string,
  roleName: string,
): Promise<ApplicationsQueueSnapshot> {
  try {
    const summary = await loadApplicationSummary(supabase, generatedAt)
    const visibility = getApplicationSourceVisibility(roleName)
    const visibleSources = APPLICATION_SOURCE_KEYS.filter((source) => visibility[source])
    const availableSourceCount = APPLICATION_SOURCE_KEYS.filter(
      (source) => visibility[source] && summary.sources[source].available,
    ).length
    const totals = totalVisibleApplicationMetrics(summary, visibility)
    const oldestAttentionAt =
      summary.attentionItems.find(
        (record) =>
          visibility[record.service] && Number.isFinite(new Date(record.createdAt).getTime()),
      )?.createdAt || null

    return {
      available: availableSourceCount > 0,
      partial: availableSourceCount > 0 && availableSourceCount < visibleSources.length,
      attentionCount: totals.attention,
      statusFollowUpCount: totals.statusFollowUp,
      missingDocumentsCount: totals.missingDocuments,
      stalledCount: totals.stalled,
      oldestAttentionAt,
    }
  } catch {
    return {
      available: false,
      partial: false,
      attentionCount: 0,
      statusFollowUpCount: 0,
      missingDocumentsCount: 0,
      stalledCount: 0,
      oldestAttentionAt: null,
    }
  }
}

async function loadPosQueueSnapshot(
  supabase: SupabaseClient,
  input: Pick<LoadDashboardWorkQueueInput, 'locationId' | 'locationName' | 'locationTimezone'>,
  generatedAt: string,
): Promise<PosQueueSnapshot> {
  return loadPosReconciliationAttentionSummary(supabase, {
    locationId: input.locationId,
    branchName: input.locationName,
    timezone: input.locationTimezone,
    generatedAt,
  })
}

async function loadPackageQueueSnapshot(
  supabase: SupabaseClient,
  generatedAt: string,
): Promise<PackageQueueSnapshot> {
  return loadPackageAttentionSummary(supabase, generatedAt)
}

async function loadFrappeQueueSnapshot(supabase: SupabaseClient): Promise<FrappeQueueSnapshot> {
  return loadFrappeAttentionSummary(supabase)
}

async function loadTrainingQueueSnapshot(
  supabase: SupabaseClient,
  input: Pick<LoadDashboardWorkQueueInput, 'employeeId' | 'locationTimezone'>,
  generatedAt: string,
): Promise<TrainingQueueSnapshot> {
  return loadTrainingAttentionSummary(supabase, {
    employeeId: input.employeeId,
    generatedAt,
    timezone: input.locationTimezone,
  })
}

export async function loadDashboardWorkQueue(
  input: LoadDashboardWorkQueueInput,
): Promise<DashboardWorkQueue> {
  const generatedAt = (input.now || new Date()).toISOString()
  const visibleModuleIds = new Set(input.visibleModuleIds)
  const [bookings, ticketing, lms, applications, packages, pos, frappe, training] =
    await Promise.all([
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
      visibleModuleIds.has('applications')
        ? loadApplicationsQueueSnapshot(input.userSupabase, generatedAt, input.roleName)
        : undefined,
      visibleModuleIds.has('packages')
        ? loadPackageQueueSnapshot(input.userSupabase, generatedAt)
        : undefined,
      visibleModuleIds.has('pos')
        ? loadPosQueueSnapshot(input.serviceSupabase, input, generatedAt)
        : undefined,
      visibleModuleIds.has('settings') ? loadFrappeQueueSnapshot(input.serviceSupabase) : undefined,
      visibleModuleIds.has('training')
        ? loadTrainingQueueSnapshot(input.userSupabase, input, generatedAt)
        : undefined,
    ])

  return buildDashboardWorkQueue({
    generatedAt,
    visibleModuleIds,
    bookings,
    ticketing,
    lms,
    applications,
    packages,
    pos,
    frappe,
    training,
  })
}
