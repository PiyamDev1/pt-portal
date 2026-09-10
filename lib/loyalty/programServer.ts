import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { LOYALTY_PROGRAM_POLICY, type LoyaltyProgramPolicy } from './program'

export type LoyaltyBonusCampaign = {
  id: string
  name: string
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
  audienceTiers: Array<'Bronze' | 'Silver' | 'Gold' | 'Diamond'>
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

export type LoyaltyCampaignOptions = {
  services: Array<{ key: string; label: string; category: string }>
  branches: Array<{ id: string; name: string }>
}

export async function loadLoyaltyProgramConfiguration(): Promise<{
  program: LoyaltyProgramPolicy
  campaigns: LoyaltyBonusCampaign[]
  campaignOptions: LoyaltyCampaignOptions
}> {
  const service = getServiceSupabaseClient()
  const [
    earningResult,
    voucherResult,
    campaignResult,
    performanceResult,
    servicesResult,
    branchesResult,
  ] = await Promise.all([
    service
      .from('customer_loyalty_program_earning_rules')
      .select('rule_key,label,points,unit_label,is_active')
      .order('display_order'),
    service
      .from('customer_loyalty_voucher_rewards')
      .select('id,points_cost,value_pence,validity_months,is_active')
      .order('display_order'),
    service
      .from('customer_loyalty_bonus_campaigns')
      .select(
        'id,name,event_type,multiplier,bonus_points,referred_customer_points,starts_at,ends_at,eligible_service_keys,eligible_branch_ids,audience_tiers,max_awards_per_customer,minimum_spend_pence,priority,linked_campaign_id,per_customer_cap,total_points_budget,allow_stacking,status,terms',
      )
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
  ])

  if (earningResult.error || voucherResult.error || campaignResult.error) {
    return {
      program: LOYALTY_PROGRAM_POLICY,
      campaigns: [],
      campaignOptions: { services: [], branches: [] },
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
  const campaigns: LoyaltyBonusCampaign[] = (campaignResult.data ?? []).map((campaign) => {
    const usage = performance.get(campaign.id)
    return {
      id: campaign.id,
      name: campaign.name,
      eventType: campaign.event_type,
      multiplier: campaign.multiplier === null ? null : Number(campaign.multiplier),
      bonusPoints: campaign.bonus_points,
      referredCustomerPoints: campaign.referred_customer_points,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      eligibleServiceKeys: campaign.eligible_service_keys ?? [],
      eligibleBranchIds: campaign.eligible_branch_ids ?? [],
      audienceTiers: campaign.audience_tiers ?? ['Bronze', 'Silver', 'Gold', 'Diamond'],
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
  return {
    program: {
      ...LOYALTY_PROGRAM_POLICY,
      earningRules: earningRules.length ? earningRules : LOYALTY_PROGRAM_POLICY.earningRules,
      voucherRewards: voucherRewards.length
        ? voucherRewards
        : LOYALTY_PROGRAM_POLICY.voucherRewards,
    },
    campaigns,
    campaignOptions: {
      services: (servicesResult.data ?? []).map((item) => ({
        key: item.item_key,
        label: item.option_label || item.label,
        category: item.group_key,
      })),
      branches: (branchesResult.data ?? []).map((branch) => ({ id: branch.id, name: branch.name })),
    },
  }
}
