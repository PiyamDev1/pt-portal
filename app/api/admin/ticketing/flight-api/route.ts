import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    monthlyLimit: z.number().int().min(1).max(1_000_000),
    weeklyIntervalDays: z.number().int().min(1).max(31),
    predepartureHours: z.number().int().min(24).max(168),
    maxChecksPerRun: z.number().int().min(1).max(100),
  })
  .strict()

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some(
    (candidate) => candidate.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalized,
  )
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function loadSettings() {
  const supabase = getServiceSupabaseClient()
  const [settingsResult, usageResult, recentResult] = await Promise.all([
    supabase.from('ticket_flight_api_settings').select('*').eq('singleton', true).maybeSingle(),
    supabase
      .from('ticket_flight_api_usage')
      .select('units')
      .eq('provider', 'aerodatabox')
      .gte('requested_at', monthStart()),
    supabase
      .from('ticket_flight_api_usage')
      .select('id, check_kind, endpoint, http_status, outcome, units, requested_at, error_message')
      .eq('provider', 'aerodatabox')
      .order('requested_at', { ascending: false })
      .limit(20),
  ])
  if (settingsResult.error || usageResult.error || recentResult.error || !settingsResult.data) {
    return null
  }
  const settings = settingsResult.data
  const used = (usageResult.data || []).reduce((total, row) => total + Number(row.units || 0), 0)
  return {
    settings: {
      enabled: settings.enabled === true,
      provider: 'aerodatabox' as const,
      monthlyLimit: Number(settings.monthly_limit),
      weeklyIntervalDays: Number(settings.weekly_interval_days),
      predepartureHours: Number(settings.predeparture_hours),
      maxChecksPerRun: Number(settings.max_checks_per_run),
      updatedAt: settings.updated_at,
      configured: Boolean(process.env.AERODATABOX_API_KEY?.trim()),
    },
    usage: {
      used,
      remaining: Math.max(Number(settings.monthly_limit) - used, 0),
      monthStartedAt: monthStart(),
    },
    recent: (recentResult.data || []).map((row) => ({
      id: row.id,
      checkKind: row.check_kind,
      endpoint: row.endpoint,
      httpStatus: row.http_status,
      outcome: row.outcome,
      units: Number(row.units),
      requestedAt: row.requested_at,
      errorMessage: row.error_message,
    })),
  }
}

export async function GET() {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!isAdmin(access.employee.role)) return apiError('Forbidden', 403)
  const payload = await loadSettings()
  return payload
    ? apiOk(payload, { headers: { 'Cache-Control': 'private, no-store' } })
    : apiError('Ticketing flight API settings are not installed.', 503)
}

export async function PATCH(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!isAdmin(access.employee.role)) return apiError('Forbidden', 403)
  const { data: input, error: bodyError } = await parseBodyWithSchema(request, settingsSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !input) return apiError(bodyError || 'Invalid flight API settings.', 400)
  if (input.enabled && !process.env.AERODATABOX_API_KEY?.trim()) {
    return apiError('Configure AERODATABOX_API_KEY before enabling automatic checks.', 409)
  }

  const supabase = getServiceSupabaseClient()
  const { error } = await supabase
    .from('ticket_flight_api_settings')
    .update({
      enabled: input.enabled,
      monthly_limit: input.monthlyLimit,
      weekly_interval_days: input.weeklyIntervalDays,
      predeparture_hours: input.predepartureHours,
      max_checks_per_run: input.maxChecksPerRun,
      updated_by: access.employee.id,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton', true)
  if (error) return apiError('Unable to save Ticketing flight API settings.', 500)
  const payload = await loadSettings()
  return payload
    ? apiOk(payload, { headers: { 'Cache-Control': 'private, no-store' } })
    : apiError('Unable to reload Ticketing flight API settings.', 500)
}
