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
  perCustomerCap: number
  totalPointsBudget: number
  allowStacking: boolean
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'
  terms: string | null
}

export async function loadLoyaltyProgramConfiguration(): Promise<{
  program: LoyaltyProgramPolicy
  campaigns: LoyaltyBonusCampaign[]
}> {
  const service = getServiceSupabaseClient()
  const [earningResult, voucherResult, campaignResult] = await Promise.all([
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
        'id,name,event_type,multiplier,bonus_points,referred_customer_points,starts_at,ends_at,eligible_service_keys,eligible_branch_ids,per_customer_cap,total_points_budget,allow_stacking,status,terms',
      )
      .order('starts_at', { ascending: false })
      .limit(100),
  ])

  if (earningResult.error || voucherResult.error || campaignResult.error) {
    return { program: LOYALTY_PROGRAM_POLICY, campaigns: [] }
  }
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
  const campaigns: LoyaltyBonusCampaign[] = (campaignResult.data ?? []).map((campaign) => ({
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
    perCustomerCap: campaign.per_customer_cap,
    totalPointsBudget: campaign.total_points_budget,
    allowStacking: campaign.allow_stacking,
    status: campaign.status as LoyaltyBonusCampaign['status'],
    terms: campaign.terms,
  }))
  return {
    program: {
      ...LOYALTY_PROGRAM_POLICY,
      earningRules: earningRules.length ? earningRules : LOYALTY_PROGRAM_POLICY.earningRules,
      voucherRewards: voucherRewards.length
        ? voucherRewards
        : LOYALTY_PROGRAM_POLICY.voucherRewards,
    },
    campaigns,
  }
}
