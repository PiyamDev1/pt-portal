import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { LOYALTY_PROGRAM_POLICY, type LoyaltyProgramPolicy } from './program'

export type LoyaltyRankName =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Ruby'
  | 'Diamond'
  | 'Kryptonite'

export type LoyaltyBonusCampaign = {
  id: string
  name: string
  eventId: string
  ruleName: string
  eventType:
    | 'double_points'
    | 'fixed_bonus'
    | 'welcome_bonus'
    | 'referral_bonus'
    | 'off_peak_bonus'
    | 'birthday_gift'
    | 'eid_gift'
  multiplier: number | null
  bonusPoints: number | null
  referredCustomerPoints: number | null
  startsAt: string
  endsAt: string
  eligibleServiceKeys: string[]
  eligibleBranchIds: string[]
  audienceTiers: LoyaltyRankName[]
  maxAwardsPerCustomer: number
  minimumSpendPence: number
  priority: number
  linkedCampaignId: string | null
  perCustomerCap: number
  totalPointsBudget: number
  allowStacking: boolean
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'
  terms: string | null
  performance: {
    awardCount: number
    customerCount: number
    awardedPoints: number
    lastAwardedAt: string | null
  }
}

export type LoyaltyCampaignEvent = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type LoyaltyCampaignOptions = {
  services: Array<{ key: string; label: string; category: string }>
  branches: Array<{ id: string; name: string }>
  walkInWindows: Array<{
    id: string
    locationId: string
    serviceType: 'nadra' | 'passport'
    isoWeekday: number
    startsAt: string
    endsAt: string
    isActive: boolean
  }>
}

export async function loadLoyaltyProgramConfiguration(options?: {
  allowFallback?: boolean
}): Promise<{
  program: LoyaltyProgramPolicy
  campaignEvents: LoyaltyCampaignEvent[]
  campaigns: LoyaltyBonusCampaign[]
  campaignOptions: LoyaltyCampaignOptions
}> {
  const service = getServiceSupabaseClient()
  const [
    earningResult,
    voucherResult,
    eventResult,
    campaignResult,
    performanceResult,
    servicesResult,
    branchesResult,
    ranksResult,
    achievementsResult,
    walkInWindowsResult,
  ] = await Promise.all([
    service
      .from('customer_loyalty_program_earning_rules')
      .select('rule_key,label,points,unit_label,is_active')
      .order('display_order'),
    service
      .from('customer_loyalty_voucher_rewards')
      .select('id,points_cost,value_pence,validity_months,is_active')
      .eq('is_active', true)
      .order('display_order'),
    service
      .from('customer_loyalty_campaign_events')
      .select('id,name,description,created_at,updated_at')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false }),
    service
      .from('customer_loyalty_bonus_campaigns')
      .select(
        'id,name,event_id,rule_name,event_type,multiplier,bonus_points,referred_customer_points,starts_at,ends_at,eligible_service_keys,eligible_branch_ids,audience_tiers,max_awards_per_customer,minimum_spend_pence,priority,linked_campaign_id,per_customer_cap,total_points_budget,allow_stacking,status,terms',
      )
      .eq('is_archived', false)
      .order('starts_at', { ascending: false })
      .limit(100),
    service
      .from('customer_loyalty_campaign_performance')
      .select('campaign_id,award_count,customer_count,awarded_points,last_awarded_at'),
    service
      .from('pos_catalogue_items')
      .select('item_key,label,option_label,group_key')
      .eq('is_active', true)
      .eq('classification', 'SERVICE')
      .order('display_order'),
    service.from('locations').select('id,name').order('name'),
    service
      .from('customer_loyalty_rank_rules')
      .select(
        'rank_key,name,minimum_points,maximum_points,maintenance_points,colour,walk_in_allowance,callback_priority,waitlist_priority,perks,is_active',
      )
      .eq('is_active', true)
      .order('display_order'),
    service
      .from('customer_loyalty_achievement_rules')
      .select('achievement_key,name,description,required_transactions,bonus_points,is_active')
      .order('display_order'),
    service
      .from('customer_loyalty_walkin_windows')
      .select('id,location_id,service_type,iso_weekday,starts_at,ends_at,is_active')
      .order('iso_weekday'),
  ])

  if (
    earningResult.error ||
    voucherResult.error ||
    eventResult.error ||
    campaignResult.error ||
    ranksResult.error ||
    achievementsResult.error ||
    walkInWindowsResult.error
  ) {
    if (options?.allowFallback === false) {
      throw new Error('The authoritative loyalty programme could not be loaded.')
    }
    return {
      program: LOYALTY_PROGRAM_POLICY,
      campaignEvents: [],
      campaigns: [],
      campaignOptions: { services: [], branches: [], walkInWindows: [] },
    }
  }
  const performance = new Map(
    (performanceResult.data ?? []).map((row) => [row.campaign_id, row] as const),
  )
  const earningRules = (earningResult.data ?? []).map((rule) => ({
    key: rule.rule_key,
    label: rule.label,
    points: Number(rule.points),
    unit: rule.unit_label,
    isActive: rule.is_active,
  }))
  const voucherRewards = (voucherResult.data ?? []).map((reward) => ({
    points: Number(reward.points_cost),
    valuePence: Number(reward.value_pence),
    validityMonths: Number(reward.validity_months),
    isActive: reward.is_active,
  }))
  const campaignEvents: LoyaltyCampaignEvent[] = (eventResult.data ?? []).map((event) => ({
    id: event.id,
    name: event.name,
    description: event.description,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  }))
  const campaigns: LoyaltyBonusCampaign[] = (campaignResult.data ?? []).map((campaign) => {
    const usage = performance.get(campaign.id)
    return {
      id: campaign.id,
      name: campaign.name,
      eventId: campaign.event_id,
      ruleName: campaign.rule_name,
      eventType: campaign.event_type,
      multiplier: campaign.multiplier === null ? null : Number(campaign.multiplier),
      bonusPoints: campaign.bonus_points,
      referredCustomerPoints: campaign.referred_customer_points,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      eligibleServiceKeys: campaign.eligible_service_keys ?? [],
      eligibleBranchIds: campaign.eligible_branch_ids ?? [],
      audienceTiers: (campaign.audience_tiers ?? [
        'Bronze',
        'Silver',
        'Gold',
        'Platinum',
        'Ruby',
        'Diamond',
        'Kryptonite',
      ]) as LoyaltyRankName[],
      maxAwardsPerCustomer: Number(campaign.max_awards_per_customer ?? 1),
      minimumSpendPence: Number(campaign.minimum_spend_pence ?? 0),
      priority: Number(campaign.priority ?? 100),
      linkedCampaignId: campaign.linked_campaign_id ?? null,
      perCustomerCap: campaign.per_customer_cap,
      totalPointsBudget: campaign.total_points_budget,
      allowStacking: campaign.allow_stacking,
      status: campaign.status as LoyaltyBonusCampaign['status'],
      terms: campaign.terms,
      performance: {
        awardCount: Number(usage?.award_count ?? 0),
        customerCount: Number(usage?.customer_count ?? 0),
        awardedPoints: Number(usage?.awarded_points ?? 0),
        lastAwardedAt: usage?.last_awarded_at ?? null,
      },
    }
  })
  const serviceOptions = new Map<string, { key: string; label: string; category: string }>()
  for (const rule of earningResult.data ?? []) {
    if (rule.is_active) {
      serviceOptions.set(rule.rule_key, {
        key: rule.rule_key,
        label: rule.label,
        category: 'Loyalty earning rule',
      })
    }
  }
  for (const item of servicesResult.data ?? []) {
    if (!serviceOptions.has(item.item_key)) {
      serviceOptions.set(item.item_key, {
        key: item.item_key,
        label: item.option_label || item.label,
        category: item.group_key,
      })
    }
  }
  return {
    program: {
      ...LOYALTY_PROGRAM_POLICY,
      earningRules: earningRules.length ? earningRules : LOYALTY_PROGRAM_POLICY.earningRules,
      voucherRewards,
      ranks: (ranksResult.data ?? []).length
        ? (ranksResult.data ?? []).map((rank) => ({
            key: rank.rank_key,
            name: rank.name,
            minimumPoints: Number(rank.minimum_points),
            maximumPoints: rank.maximum_points === null ? null : Number(rank.maximum_points),
            maintenancePoints: Number(rank.maintenance_points),
            colour: rank.colour,
            walkInAllowance: Number(rank.walk_in_allowance),
            callbackPriority: Number(rank.callback_priority),
            waitlistPriority: Number(rank.waitlist_priority),
            perks: rank.perks ?? [],
          }))
        : LOYALTY_PROGRAM_POLICY.ranks,
      achievementRules: (achievementsResult.data ?? []).length
        ? (achievementsResult.data ?? []).map((rule) => ({
            key: rule.achievement_key,
            name: rule.name,
            description: rule.description,
            requiredTransactions: Number(rule.required_transactions),
            bonusPoints: Number(rule.bonus_points),
            isActive: rule.is_active,
          }))
        : LOYALTY_PROGRAM_POLICY.achievementRules,
    },
    campaignEvents,
    campaigns,
    campaignOptions: {
      services: [...serviceOptions.values()],
      branches: (branchesResult.data ?? []).map((branch) => ({ id: branch.id, name: branch.name })),
      walkInWindows: (walkInWindowsResult.data ?? []).map((window) => ({
        id: window.id,
        locationId: window.location_id,
        serviceType: window.service_type as 'nadra' | 'passport',
        isoWeekday: Number(window.iso_weekday),
        startsAt: String(window.starts_at).slice(0, 5),
        endsAt: String(window.ends_at).slice(0, 5),
        isActive: window.is_active,
      })),
    },
  }
}
