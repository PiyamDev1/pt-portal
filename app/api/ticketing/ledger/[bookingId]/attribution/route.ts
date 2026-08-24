import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  TICKET_ATTRIBUTION_CAPABILITY_VERSION,
  ticketingCorrectAttributionSchema,
  type TicketingAttributionEmployee,
  type TicketingCorrectAttributionInput,
  type TicketingCorrectAttributionResult,
} from '@/lib/ticketing/attributionContracts'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type RouteContext = { params: Promise<{ bookingId: string }> }

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type AttributionRpcResult = {
  bookingId?: string
  bookingVersion?: number | string
  attribution?: {
    version?: number | string
    primaryEmployeeId?: string
    assistantEmployeeIds?: unknown
  }
  idempotentReplay?: boolean
}

type EmployeeRow = {
  id: string
  full_name: string | null
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function canManageTicketingAttribution(role: string) {
  const normalizeRole = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  const normalizedRole = normalizeRole(role)
  return ADMIN_ROLES.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole)
}

async function hasAttributionCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return false
  const status = data as Record<string, unknown>
  return (
    status.ready === true && Number(status.version || 0) >= TICKET_ATTRIBUTION_CAPABILITY_VERSION
  )
}

function currentBookingVersion(details: string | null | undefined) {
  try {
    const value = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = Number(value.bookingVersion)
    return Number.isSafeInteger(bookingVersion) && bookingVersion > 0 ? bookingVersion : undefined
  } catch {
    return undefined
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')

  if (hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    const bookingVersion = currentBookingVersion(error.details)
    return privateError(
      'This ticket changed after you opened it. Refresh the ledger and try again.',
      409,
      {
        code: 'VERSION_CONFLICT',
        ...(bookingVersion ? { currentBookingVersion: bookingVersion } : {}),
      },
    )
  }
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return privateError('This save key was already used for a different correction.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_ATTRIBUTION_NO_CHANGE') {
    return privateError('The selected ticket attribution is already current.', 409, {
      code: 'ATTRIBUTION_NO_CHANGE',
    })
  }
  if (hint === 'TICKETING_ATTRIBUTION_REASON_REQUIRED') {
    return privateError('A reason is required when correcting ticket attribution.', 400, {
      code: 'ATTRIBUTION_REASON_REQUIRED',
    })
  }
  if (
    hint === 'TICKETING_ATTRIBUTION_EMPLOYEE_INVALID' ||
    hint === 'TICKETING_ATTRIBUTION_INVALID' ||
    (error.code === '22023' && /employees? (?:is|are) invalid or inactive/i.test(message))
  ) {
    return privateError('Select active employees for the responsible and assistant roles.', 400, {
      code: 'INVALID_ATTRIBUTION_EMPLOYEE',
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22023', '23503', '23514', 'P0002'].includes(String(error.code || ''))) {
    return privateError('Invalid ticket attribution.', 400)
  }
  return privateError('Unable to correct ticket attribution right now.', 500)
}

function parsedRpcAttribution(
  data: unknown,
  bookingId: string,
  entry: TicketingCorrectAttributionInput,
) {
  const result = data as AttributionRpcResult | null
  const bookingVersion = Number(result?.bookingVersion)
  const attributionVersion = Number(result?.attribution?.version)
  const primaryEmployeeId = result?.attribution?.primaryEmployeeId
  const assistantEmployeeIds = Array.isArray(result?.attribution?.assistantEmployeeIds)
    ? result.attribution.assistantEmployeeIds.filter(
        (employeeId): employeeId is string => typeof employeeId === 'string',
      )
    : null
  if (!assistantEmployeeIds) return null
  const expectedAssistants = [...entry.assistantEmployeeIds].sort()
  const returnedAssistants = [...assistantEmployeeIds].sort()

  if (
    result?.bookingId !== bookingId ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion <= entry.expectedBookingVersion ||
    !Number.isSafeInteger(attributionVersion) ||
    attributionVersion < 1 ||
    primaryEmployeeId !== entry.responsibleEmployeeId ||
    returnedAssistants.length !== expectedAssistants.length ||
    returnedAssistants.some((employeeId, index) => employeeId !== expectedAssistants[index]) ||
    typeof result.idempotentReplay !== 'boolean'
  ) {
    return null
  }

  return {
    bookingVersion,
    attributionVersion,
    primaryEmployeeId,
    assistantEmployeeIds,
    idempotentReplay: result.idempotentReplay,
  }
}

async function employeeNames(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  employeeIds: string[],
) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name')
    .in('id', employeeIds)
  if (error) return null

  const byId = new Map(
    ((data || []) as EmployeeRow[]).map(
      (employee) =>
        [
          employee.id,
          { id: employee.id, fullName: employee.full_name?.trim() || 'Staff member' },
        ] as const,
    ),
  )
  return employeeIds
    .map((employeeId) => byId.get(employeeId))
    .filter((employee): employee is TicketingAttributionEmployee => Boolean(employee))
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!canManageTicketingAttribution(access.employee.role)) return privateError('Forbidden', 403)

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.correct-attribution',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingCorrectAttributionSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !entry) return privateError(bodyError || 'Invalid ticket attribution.', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasAttributionCapability(supabase))) {
    return privateError('Ticket attribution is not installed on this database.', 503)
  }

  // Resolve presentation-safe recipients before the atomic write. Otherwise a
  // nullable/blank employee name could let the correction commit and then turn
  // the HTTP response (and every idempotent replay) into a 500.
  const selectedEmployeeIds = [entry.responsibleEmployeeId, ...entry.assistantEmployeeIds]
  const selectedEmployees = await employeeNames(supabase, selectedEmployeeIds)
  if (!selectedEmployees) {
    return privateError('Unable to load ticket attribution employees right now.', 500)
  }
  if (selectedEmployees.length !== selectedEmployeeIds.length) {
    return privateError('Select active employees for ticket attribution.', 400, {
      code: 'INVALID_ATTRIBUTION_EMPLOYEE',
    })
  }
  const selectedEmployeesById = new Map(
    selectedEmployees.map((employee) => [employee.id, employee]),
  )

  const { data, error } = await supabase.rpc('ticketing_correct_booking_attribution', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_expected_booking_version: entry.expectedBookingVersion,
    p_idempotency_key: idempotencyKey,
    p_attribution: {
      responsibleEmployeeId: entry.responsibleEmployeeId,
      assistantEmployeeIds: entry.assistantEmployeeIds,
      reason: entry.reason,
    },
  })
  if (error) return mutationError(error)

  const attribution = parsedRpcAttribution(data, parsedBookingId.data, entry)
  if (!attribution) return privateError('Ticketing returned an invalid attribution result.', 500)

  const responsibleEmployee = selectedEmployeesById.get(attribution.primaryEmployeeId)
  const assistantEmployees = attribution.assistantEmployeeIds.map((employeeId) =>
    selectedEmployeesById.get(employeeId),
  )
  if (!responsibleEmployee || assistantEmployees.some((employee) => !employee)) {
    return privateError('Unable to load the corrected ticket attribution.', 500)
  }

  const result: TicketingCorrectAttributionResult = {
    bookingId: parsedBookingId.data,
    bookingVersion: attribution.bookingVersion,
    attributionVersion: attribution.attributionVersion,
    responsibleEmployee,
    assistantEmployees: assistantEmployees as TicketingAttributionEmployee[],
    idempotentReplay: attribution.idempotentReplay,
  }

  return apiOk(result, PRIVATE_RESPONSE)
}
