import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import type {
  LoyaltyDashboardPayload,
  LoyaltyEntry,
  LoyaltyMember,
  LoyaltyMemberPayload,
} from './contracts'
import { loadLoyaltyProgramConfiguration } from './programServer'

type Related<T> = T | T[] | null

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] : value
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapMember(row: {
  id: string | null
  customer_code: string | null
  customer_name: string | null
  email: string | null
  phone_number: string | null
  customer_lifecycle_status: string | null
  portal_linked: boolean | null
  available_points: number | null
  rank_points: number | null
  pending_points: number | null
  lifetime_points: number | null
  entry_count: number | null
  joined_at: string | null
  last_activity_at: string | null
}): LoyaltyMember {
  return {
    id: row.id || '',
    customerCode: row.customer_code || 'Not assigned',
    name: row.customer_name || 'Loyalty member',
    email: row.email || '',
    phone: row.phone_number,
    status: row.customer_lifecycle_status || 'active',
    portalLinked: row.portal_linked === true,
    availablePoints: numberValue(row.available_points),
    rankPoints: numberValue(row.rank_points),
    pendingPoints: numberValue(row.pending_points),
    lifetimePoints: numberValue(row.lifetime_points),
    entryCount: numberValue(row.entry_count),
    joinedAt: row.joined_at || new Date(0).toISOString(),
    lastActivityAt: row.last_activity_at,
  }
}

export async function loadLoyaltyDashboard(
  search: string,
  canAdjust: boolean,
): Promise<LoyaltyDashboardPayload> {
  const service = getServiceSupabaseClient()
  let memberQuery = service
    .from('customer_loyalty_staff_member_summary')
    .select(
      'id,customer_code,customer_name,email,phone_number,customer_lifecycle_status,portal_linked,available_points,pending_points,lifetime_points,entry_count,joined_at,last_activity_at,rank_points',
      { count: 'exact' },
    )
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (search) {
    const literalSearch = search.replace(/[\\%_]/g, '\\$&')
    memberQuery = memberQuery.ilike('search_text', `%${literalSearch}%`)
  }

  const [overviewResult, memberResult, programConfiguration] = await Promise.all([
    service.from('customer_loyalty_staff_overview').select('*').single(),
    memberQuery,
    loadLoyaltyProgramConfiguration(),
  ])
  if (overviewResult.error || memberResult.error) {
    throw new Error('Unable to load loyalty data.')
  }
  const overview = overviewResult.data
  return {
    overview: {
      memberCount: numberValue(overview.member_count),
      portalLinkedCount: numberValue(overview.portal_linked_count),
      availablePoints: numberValue(overview.available_points),
      pendingPoints: numberValue(overview.pending_points),
      entriesLast30Days: numberValue(overview.entries_last_30_days),
    },
    members: (memberResult.data || []).map(mapMember),
    tiers: programConfiguration.program.ranks.map((tier) => ({
      name: tier.name,
      minimumPoints: tier.minimumPoints,
      multiplier: 1,
    })),
    totalMembers: memberResult.count || 0,
    canAdjust,
    loadedAt: new Date().toISOString(),
    program: programConfiguration.program,
    campaigns: programConfiguration.campaigns,
    campaignOptions: programConfiguration.campaignOptions,
  }
}

export async function manageLoyaltyProgram(input: {
  actorEmployeeId: string
  action: string
  request: Record<string, unknown>
}) {
  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_manage_program_v4',
    {
      p_actor_employee_id: input.actorEmployeeId,
      p_action: input.action,
      p_request: input.request,
    },
  )
  if (error) {
    const safeCampaignErrors = [
      'campaign limits cannot be reduced below points or awards already issued',
      'ended or cancelled campaigns cannot be reactivated',
      'campaign links cannot form a cycle',
      'a campaign cannot link to itself',
      'linked campaign not found',
      'referral campaigns must remain available to all ranks',
    ]
    const safeMessage = safeCampaignErrors.find((message) => error.message.includes(message))
    throw new Error(safeMessage ?? 'Unable to save the loyalty program change.')
  }
  return data
}

export async function loadLoyaltyMember(memberId: string): Promise<LoyaltyMemberPayload | null> {
  const service = getServiceSupabaseClient()
  const [memberResult, awardResult, adjustmentResult] = await Promise.all([
    service
      .from('customer_loyalty_staff_member_summary')
      .select(
        'id,customer_code,customer_name,email,phone_number,customer_lifecycle_status,portal_linked,available_points,pending_points,lifetime_points,entry_count,joined_at,last_activity_at,rank_points',
      )
      .eq('id', memberId)
      .maybeSingle(),
    service
      .from('customer_loyalty_awards')
      .select('id,description,points,state,source_type,created_at')
      .eq('mobile_user_id', memberId)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('customer_loyalty_staff_adjustments')
      .select(
        'award_id,employees!customer_loyalty_staff_adjustments_actor_employee_id_fkey(full_name)',
      )
      .eq('mobile_user_id', memberId),
  ])
  if (memberResult.error || awardResult.error || adjustmentResult.error) {
    throw new Error('Unable to load the loyalty member.')
  }
  if (!memberResult.data) return null
  const adjustmentActors = new Map(
    (adjustmentResult.data || []).map((row) => [
      row.award_id,
      first(row.employees as Related<{ full_name: string | null }>)?.full_name || 'Administrator',
    ]),
  )
  const entries: LoyaltyEntry[] = (awardResult.data || []).map((row) => ({
    id: row.id,
    description: row.description,
    points: numberValue(row.points),
    state: row.state as LoyaltyEntry['state'],
    sourceType: row.source_type as LoyaltyEntry['sourceType'],
    createdAt: row.created_at,
    adjustedBy: adjustmentActors.get(row.id) || null,
  }))
  return { member: mapMember(memberResult.data), entries }
}

export async function adjustLoyaltyPoints(input: {
  actorEmployeeId: string
  memberId: string
  points: number
  reason: string
  idempotencyKey: string
}) {
  const service = getServiceSupabaseClient()
  const { data, error } = await service.rpc('customer_loyalty_staff_adjust_v1', {
    p_actor_employee_id: input.actorEmployeeId,
    p_mobile_user_id: input.memberId,
    p_points: input.points,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('negative'))
      throw new Error('The adjustment would make the balance negative.')
    if (message.includes('not found')) throw new Error('Loyalty member not found.')
    if (message.includes('not active')) throw new Error('Only active members can be adjusted.')
    throw new Error('Unable to save the points adjustment.')
  }
  return data
}
