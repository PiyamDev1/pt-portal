import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_SCHEDULE_CHANGE_ACTIONS,
  TICKET_SCHEDULE_CHANGE_CAPABILITY_VERSION,
  TICKET_SCHEDULE_STATUSES,
  ticketingScheduleChangeMutationSchema,
  type TicketingScheduleChangeMutationResponse,
} from '@/lib/ticketing/itineraryContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const sectorIdSchema = z.string().uuid()

type RouteContext = { params: Promise<{ sectorId: string }> }

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function mutationError(error: TicketingRpcError) {
  const code = String(error.code || '')
  const hint = String(error.hint || '')

  if (
    code === 'P0002' ||
    hint === 'TICKETING_SECTOR_NOT_FOUND' ||
    hint === 'TICKETING_SCHEDULE_CHANGE_NOT_FOUND'
  ) {
    return privateError('Flight or schedule change not found.', 404)
  }
  if (
    code === '40001' ||
    hint === 'TICKETING_ITINERARY_VERSION_CONFLICT' ||
    hint === 'TICKETING_SCHEDULE_STATE_CONFLICT'
  ) {
    return privateError(
      'This flight changed after you opened it. Refresh and review it again.',
      409,
      {
        code: 'VERSION_CONFLICT',
      },
    )
  }
  if (hint === 'TICKETING_IDEMPOTENCY_CONFLICT') {
    return privateError('This request ID was already used for a different schedule action.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_SCHEDULE_UNCHANGED') {
    return privateError(
      'Enter a proposed flight number or time that differs from the current schedule.',
      400,
      {
        code: 'SCHEDULE_UNCHANGED',
      },
    )
  }
  if (
    hint === 'TICKETING_LOCAL_TIME_INVALID' ||
    hint === 'TICKETING_LOCAL_TIME_GAP' ||
    hint === 'TICKETING_ITINERARY_CHRONOLOGY_INVALID'
  ) {
    return privateError('Check the proposed local departure and arrival times.', 400, {
      code: 'INVALID_LOCAL_TIME',
    })
  }
  if (code === '42501' || hint === 'TICKETING_SCHEDULE_ON_BEHALF_FORBIDDEN') {
    return privateError(
      'Only the responsible agent or an administrator can complete this action.',
      403,
    )
  }
  if (['22007', '22023', '23503', '23505', '23514'].includes(code)) {
    return privateError('Invalid schedule-change details.', 400)
  }
  return privateError('Unable to update the flight schedule right now.', 500)
}

function resultFromRpc(data: unknown): TicketingScheduleChangeMutationResponse | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const result = data as Record<string, unknown>
  const action = TICKET_SCHEDULE_CHANGE_ACTIONS.find((value) => value === result.action)
  const scheduleStatus = TICKET_SCHEDULE_STATUSES.find((value) => value === result.scheduleStatus)
  const itineraryVersion = Number(result.itineraryVersion)
  if (
    !action ||
    !scheduleStatus ||
    !sectorIdSchema.safeParse(result.changeId).success ||
    !sectorIdSchema.safeParse(result.eventId).success ||
    !sectorIdSchema.safeParse(result.bookingId).success ||
    !sectorIdSchema.safeParse(result.priorSectorId).success ||
    !sectorIdSchema.safeParse(result.sectorId).success ||
    !sectorIdSchema.safeParse(result.ownerEmployeeId).success ||
    !sectorIdSchema.safeParse(result.actingEmployeeId).success ||
    !Number.isSafeInteger(itineraryVersion) ||
    itineraryVersion < 1 ||
    typeof result.isOnBehalf !== 'boolean' ||
    typeof result.idempotentReplay !== 'boolean' ||
    (result.appliedSector !== null &&
      (typeof result.appliedSector !== 'object' || Array.isArray(result.appliedSector)))
  ) {
    return null
  }

  return {
    action,
    changeId: result.changeId as string,
    eventId: result.eventId as string,
    bookingId: result.bookingId as string,
    priorSectorId: result.priorSectorId as string,
    sectorId: result.sectorId as string,
    itineraryVersion,
    scheduleStatus,
    ownerEmployeeId: result.ownerEmployeeId as string,
    actingEmployeeId: result.actingEmployeeId as string,
    isOnBehalf: result.isOnBehalf,
    appliedSector: result.appliedSector as Record<string, unknown> | null,
    idempotentReplay: result.idempotentReplay,
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const sectorId = sectorIdSchema.safeParse((await params).sectorId)
  if (!sectorId.success) return privateError('Flight or schedule change not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.schedule-change',
    limit: 40,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingScheduleChangeMutationSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !entry) {
    return privateError(bodyError || 'Invalid schedule-change details.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const { data: capability, error: capabilityError } = await supabase.rpc('ticketing_schema_status')
  if (
    capabilityError ||
    !hasTicketingSchemaCapability(capability, TICKET_SCHEDULE_CHANGE_CAPABILITY_VERSION)
  ) {
    return privateError(
      'Ticketing schedule-change handling is not installed on this database.',
      503,
    )
  }

  const { data, error } = await supabase.rpc('ticketing_transition_schedule_change', {
    p_actor_employee_id: access.employee.id,
    p_sector_id: sectorId.data,
    p_expected_itinerary_version: entry.expectedItineraryVersion,
    p_idempotency_key: entry.requestId,
    p_action: entry.action,
    p_change_id: entry.changeId,
    p_proposal: entry.proposal,
    p_reason: entry.reason,
  })
  if (error) return mutationError(error)

  const result = resultFromRpc(data)
  if (!result || result.actingEmployeeId !== access.employee.id) {
    return privateError('Ticketing returned an invalid schedule-change result.', 500)
  }
  return apiOk(result, PRIVATE_RESPONSE)
}
