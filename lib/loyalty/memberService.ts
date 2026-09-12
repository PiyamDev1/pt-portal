import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { normalizeCustomerLoyaltyCode } from '@/lib/customerPortal/loyaltyLifecycle'

const PROGRAMME_TIME_ZONE = 'Europe/London'

type ServiceType = 'nadra' | 'passport'

type MemberServiceAvailability = {
  member: {
    customerCode: string
    maskedCode: string
    name: string
  }
  branch: {
    id: string
    name: string
  }
  rank: {
    key: string
    name: string
    colour: string
  } | null
  allowance: number
  used: number
  remaining: number
  canUse: boolean
  unavailableReason: string | null
  serviceType: ServiceType | null
  programmeYear: number
}

export class MemberServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function londonClock(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB-u-ca-gregory', {
    timeZone: PROGRAMME_TIME_ZONE,
    year: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  const isoWeekday =
    ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[
      part('weekday') as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
    ] ?? 0
  return {
    programmeYear: Number(part('year')),
    isoWeekday,
    localTime: `${part('hour')}:${part('minute')}:${part('second')}`,
  }
}

export async function lookupMemberService(input: {
  rawCode: string
  locationId: string
  at?: Date
}): Promise<MemberServiceAvailability> {
  let customerCode: string
  try {
    customerCode = normalizeCustomerLoyaltyCode(input.rawCode)
  } catch {
    throw new MemberServiceError(
      'Scan a valid Piyam loyalty card or enter its customer code.',
      400,
      'LOYALTY_CODE_INVALID',
    )
  }

  const service = getServiceSupabaseClient()
  const [memberResult, branchResult] = await Promise.all([
    service
      .from('customer_loyalty_staff_member_summary')
      .select('id,customer_code,customer_name,customer_lifecycle_status,rank_points')
      .eq('customer_code', customerCode)
      .eq('customer_lifecycle_status', 'active')
      .maybeSingle(),
    service
      .from('locations')
      .select('id,name')
      .eq('id', input.locationId)
      .eq('type', 'Branch')
      .eq('appointments_enabled', true)
      .maybeSingle(),
  ])
  if (memberResult.error || branchResult.error) {
    throw new MemberServiceError(
      'Member Service is temporarily unavailable.',
      503,
      'MEMBER_SERVICE_UNAVAILABLE',
    )
  }
  if (!memberResult.data) {
    throw new MemberServiceError(
      'No active loyalty member matched that card.',
      404,
      'LOYALTY_MEMBER_NOT_FOUND',
    )
  }
  if (!branchResult.data) {
    throw new MemberServiceError(
      'Select an appointment-enabled branch before using Member Service.',
      400,
      'MEMBER_SERVICE_BRANCH_INVALID',
    )
  }

  const member = memberResult.data
  const clock = londonClock(input.at ?? new Date())
  const rankPoints = numeric(member.rank_points)
  const [rankResult, usageResult, windowResult] = await Promise.all([
    service
      .from('customer_loyalty_rank_rules')
      .select('rank_key,name,colour,walk_in_allowance')
      .eq('is_active', true)
      .lte('minimum_points', rankPoints)
      .order('minimum_points', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('customer_loyalty_walkin_usages')
      .select('id', { count: 'exact', head: true })
      .eq('mobile_user_id', member.id)
      .eq('programme_year', clock.programmeYear)
      .eq('consumes_allowance', true),
    service
      .from('customer_loyalty_walkin_windows')
      .select('service_type')
      .eq('location_id', input.locationId)
      .eq('is_active', true)
      .eq('iso_weekday', clock.isoWeekday)
      .lte('starts_at', clock.localTime)
      .gt('ends_at', clock.localTime)
      .order('service_type')
      .limit(1)
      .maybeSingle(),
  ])
  if (rankResult.error || usageResult.error || windowResult.error) {
    throw new MemberServiceError(
      'Member Service is temporarily unavailable.',
      503,
      'MEMBER_SERVICE_UNAVAILABLE',
    )
  }

  const rank = rankResult.data
  const allowance = numeric(rank?.walk_in_allowance)
  const used = usageResult.count ?? 0
  const remaining = Math.max(allowance - used, 0)
  const serviceType = (windowResult.data?.service_type as ServiceType | undefined) ?? null
  let unavailableReason: string | null = null
  if (!rank || allowance === 0) {
    unavailableReason = 'This member’s current rank does not include walk-in access.'
  } else if (remaining === 0) {
    unavailableReason = `This member has used all ${allowance} walk-in uses for ${clock.programmeYear}.`
  } else if (!serviceType) {
    unavailableReason = 'Member walk-ins are not currently open at this branch.'
  }

  return {
    member: {
      customerCode,
      maskedCode: `${customerCode.slice(0, 8)}••••${customerCode.slice(-2)}`,
      name: member.customer_name || 'Loyalty member',
    },
    branch: branchResult.data,
    rank: rank ? { key: rank.rank_key, name: rank.name, colour: rank.colour } : null,
    allowance,
    used,
    remaining,
    canUse: unavailableReason === null,
    unavailableReason,
    serviceType,
    programmeYear: clock.programmeYear,
  }
}

export async function consumeMemberService(input: {
  rawCode: string
  locationId: string
  actorEmployeeId: string
  idempotencyKey: string
}) {
  const availability = await lookupMemberService(input)
  if (!availability.canUse || !availability.serviceType) {
    throw new MemberServiceError(
      availability.unavailableReason || 'This walk-in cannot be used now.',
      409,
      'MEMBER_SERVICE_NOT_AVAILABLE',
    )
  }

  const service = getServiceSupabaseClient()
  const { data: member, error: memberError } = await service
    .from('mobile_users')
    .select('id')
    .eq('customer_code', availability.member.customerCode)
    .eq('customer_lifecycle_status', 'active')
    .maybeSingle()
  if (memberError || !member) {
    throw new MemberServiceError(
      'Member Service is temporarily unavailable.',
      503,
      'MEMBER_SERVICE_UNAVAILABLE',
    )
  }

  const { data, error } = await service.rpc('customer_loyalty_consume_walkin_v1', {
    p_mobile_user_id: member.id,
    p_location_id: input.locationId,
    p_service_type: availability.serviceType,
    p_actor_employee_id: input.actorEmployeeId,
    p_idempotency_key: input.idempotencyKey,
    p_is_override: false,
    p_override_reason: null,
    p_consume_allowance: true,
  })
  if (error) {
    const safeMessages: Record<string, string> = {
      LOYALTY_WALKIN_WINDOW_CLOSED: 'Member walk-ins are not currently open at this branch.',
      LOYALTY_WALKIN_NOT_ENTITLED: 'This member’s current rank does not include walk-in access.',
      LOYALTY_WALKIN_ALLOWANCE_EXHAUSTED:
        'This member has already used their annual walk-in allowance.',
      LOYALTY_WALKIN_SERVICE_INELIGIBLE:
        'This branch does not offer an eligible member walk-in now.',
    }
    throw new MemberServiceError(
      safeMessages[error.hint || ''] || 'The walk-in use could not be recorded.',
      409,
      error.hint || 'MEMBER_SERVICE_CONFIRMATION_FAILED',
    )
  }

  const result = (data ?? {}) as Record<string, unknown>
  const refreshed = await lookupMemberService({
    rawCode: availability.member.customerCode,
    locationId: input.locationId,
  })
  return {
    member: refreshed.member,
    branch: refreshed.branch,
    rank: refreshed.rank,
    allowance: refreshed.allowance,
    used: refreshed.used,
    remaining: refreshed.remaining,
    programmeYear: refreshed.programmeYear,
    idempotentReplay: result.idempotentReplay === true,
  }
}
