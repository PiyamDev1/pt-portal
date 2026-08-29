import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'
import { fetchAeroDataBoxFlight, isAeroDataBoxConfigured } from '@/lib/ticketing/aerodatabox.server'
import { TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION } from '@/lib/ticketing/contracts'
import { ticketingFlightCheckKind } from '@/lib/ticketing/flightMonitorCadence'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type SettingsRow = {
  enabled: boolean
  monthly_limit: number
  weekly_interval_days: number
  predeparture_hours: number
  max_checks_per_run: number
}
type StateRow = {
  sector_id: string
  last_weekly_checked_at: string | null
  predeparture_checked_at: string | null
}
type SectorRow = {
  id: string
  flight_number: string
  origin_airport_code: string
  destination_airport_code: string
  departure_local: string
  departure_at_utc: string
  arrival_local: string | null
  is_active: boolean
  retired_at: string | null
  ticket_bookings:
    | { archived_at: string | null; operational_status: string }
    | Array<{ archived_at: string | null; operational_status: string }>
    | null
}
type DueCheck = {
  sector: SectorRow
  checkKind: 'weekly' | 'predeparture'
  priority: number
}

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] || null : value
}

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function minute(value: string | null) {
  return value?.replace(' ', 'T').slice(0, 16) || null
}

function matchesSchedule(
  sector: SectorRow,
  schedule: {
    originIata: string | null
    destinationIata: string | null
    departureLocal: string | null
    arrivalLocal: string | null
  },
) {
  return (
    schedule.originIata === sector.origin_airport_code &&
    schedule.destinationIata === sector.destination_airport_code &&
    schedule.departureLocal === minute(sector.departure_local) &&
    (!sector.arrival_local ||
      !schedule.arrivalLocal ||
      schedule.arrivalLocal === minute(sector.arrival_local))
  )
}

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(
      capability.data,
      TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION,
    )
  ) {
    return apiError('Ticketing flight API monitoring is not installed.', 503)
  }

  const { data: settingsData, error: settingsError } = await supabase
    .from('ticket_flight_api_settings')
    .select('enabled, monthly_limit, weekly_interval_days, predeparture_hours, max_checks_per_run')
    .eq('singleton', true)
    .maybeSingle()
  if (settingsError || !settingsData) return apiError('Unable to load flight API settings.', 500)
  const settings = settingsData as SettingsRow
  if (!settings.enabled) return apiOk({ ok: true, skipped: 'disabled', processed: 0 })
  if (!isAeroDataBoxConfigured()) return apiError('AeroDataBox is enabled but not configured.', 503)

  const now = new Date()
  const { data: usageData, error: usageError } = await supabase
    .from('ticket_flight_api_usage')
    .select('units')
    .eq('provider', 'aerodatabox')
    .gte('requested_at', monthStart(now))
  if (usageError) return apiError('Unable to load flight API usage.', 500)
  const used = (usageData || []).reduce((total, row) => total + Number(row.units || 0), 0)
  const available = Math.max(Number(settings.monthly_limit) - used, 0)
  if (available === 0)
    return apiOk({ ok: true, skipped: 'monthly_limit_reached', processed: 0, used })

  const horizon = new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000).toISOString()
  const { data: sectorData, error: sectorError } = await supabase
    .from('ticket_itinerary_sectors')
    .select(
      `id, flight_number, origin_airport_code, destination_airport_code, departure_local, departure_at_utc, arrival_local, is_active, retired_at, ticket_bookings!inner(archived_at, operational_status)`,
    )
    .eq('is_active', true)
    .is('retired_at', null)
    .gt('departure_at_utc', now.toISOString())
    .lte('departure_at_utc', horizon)
    .eq('ticket_bookings.operational_status', 'issued')
    .is('ticket_bookings.archived_at', null)
    .order('departure_at_utc', { ascending: true })
    .limit(1000)
  if (sectorError) return apiError('Unable to load monitored flight sectors.', 500)

  const sectors = (sectorData || []) as unknown as SectorRow[]
  const sectorIds = sectors.map((sector) => sector.id)
  let states = new Map<string, StateRow>()
  if (sectorIds.length > 0) {
    const { data: stateData, error: stateError } = await supabase
      .from('ticket_flight_api_sector_state')
      .select('sector_id, last_weekly_checked_at, predeparture_checked_at')
      .in('sector_id', sectorIds)
    if (stateError) return apiError('Unable to load flight monitoring state.', 500)
    states = new Map(((stateData || []) as StateRow[]).map((state) => [state.sector_id, state]))
  }

  const due = sectors
    .reduce<DueCheck[]>((checks, sector) => {
      const booking = first(sector.ticket_bookings)
      if (!booking || booking.archived_at || booking.operational_status !== 'issued') return checks
      const state = states.get(sector.id)
      const checkKind = ticketingFlightCheckKind({
        now,
        departureAtUtc: sector.departure_at_utc,
        weeklyIntervalDays: Number(settings.weekly_interval_days),
        predepartureHours: Number(settings.predeparture_hours),
        lastWeeklyCheckedAt: state?.last_weekly_checked_at || null,
        predepartureCheckedAt: state?.predeparture_checked_at || null,
      })
      if (checkKind)
        checks.push({ sector, checkKind, priority: checkKind === 'predeparture' ? 0 : 1 })
      return checks
    }, [])
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.sector.departure_at_utc.localeCompare(right.sector.departure_at_utc),
    )
    .slice(0, Math.min(available, Number(settings.max_checks_per_run)))

  const results = await Promise.all(
    due.map(async ({ sector, checkKind }) => {
      const departureDate = sector.departure_local.slice(0, 10)
      const endpoint = `/flights/number/${sector.flight_number}/${departureDate}`
      const { data: usageRow, error: startError } = await supabase
        .from('ticket_flight_api_usage')
        .insert({
          provider: 'aerodatabox',
          sector_id: sector.id,
          check_kind: checkKind,
          endpoint,
          outcome: 'started',
          units: 1,
          requested_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (startError || !usageRow?.id) return { sectorId: sector.id, outcome: 'tracking_failed' }

      const provider = await fetchAeroDataBoxFlight({
        flightNumber: sector.flight_number,
        departureDate,
      })
      const checkedAt = new Date().toISOString()
      let outcome: 'matched' | 'change_detected' | 'not_found' | 'failed'
      let providerSchedule: unknown = null
      let providerStatus: string | null = null
      let errorMessage: string | null = null
      if (!provider.ok) {
        outcome = provider.httpStatus === 404 ? 'not_found' : 'failed'
        errorMessage = provider.error
      } else {
        const relevant =
          provider.schedules.find(
            (schedule) =>
              schedule.originIata === sector.origin_airport_code &&
              schedule.destinationIata === sector.destination_airport_code,
          ) || provider.schedules[0]
        if (!relevant) outcome = 'not_found'
        else {
          providerSchedule = relevant
          providerStatus = relevant.status
          outcome = matchesSchedule(sector, relevant) ? 'matched' : 'change_detected'
        }
      }

      const completedCadence =
        outcome === 'failed'
          ? {}
          : checkKind === 'weekly'
            ? { last_weekly_checked_at: checkedAt }
            : { predeparture_checked_at: checkedAt }
      await Promise.all([
        supabase
          .from('ticket_flight_api_usage')
          .update({
            http_status: provider.httpStatus,
            outcome,
            error_message: errorMessage,
            completed_at: checkedAt,
          })
          .eq('id', usageRow.id),
        supabase.from('ticket_flight_api_sector_state').upsert(
          {
            sector_id: sector.id,
            ...completedCadence,
            last_checked_at: checkedAt,
            last_check_status: outcome,
            last_provider_status: providerStatus,
            last_provider_schedule: providerSchedule,
            schedule_change_detected_at: outcome === 'change_detected' ? checkedAt : null,
            last_error: errorMessage,
            updated_at: checkedAt,
          },
          { onConflict: 'sector_id' },
        ),
      ])
      return { sectorId: sector.id, outcome }
    }),
  )

  return apiOk({
    ok: true,
    processed: results.length,
    usedBeforeRun: used,
    remainingAfterRun: Math.max(available - results.length, 0),
    outcomes: results.reduce<Record<string, number>>((counts, result) => {
      counts[result.outcome] = (counts[result.outcome] || 0) + 1
      return counts
    }, {}),
  })
}
