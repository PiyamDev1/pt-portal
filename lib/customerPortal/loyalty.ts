import 'server-only'

import { createHash } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { loadLoyaltyProgramConfiguration } from '@/lib/loyalty/programServer'
import { CustomerIntegrationError } from './http'

type LoyaltySource = 'ticket' | 'service' | 'package' | 'adjustment'

export function customerLoyaltyEntryId(internalId: string) {
  return `loy_${createHash('sha256').update(internalId).digest('base64url').slice(0, 24)}`
}

export async function customerMobileUser(input: {
  customerSubject: string
  customerCode: string
  email: string
  birthdayRewardMonth?: number | null
  birthdayRewardDay?: number | null
}) {
  const service = getServiceSupabaseClient()
  const normalizedEmail = input.email.trim().toLocaleLowerCase('en-GB')
  const birthdayFields =
    input.birthdayRewardMonth === undefined && input.birthdayRewardDay === undefined
      ? {}
      : {
          birthday_reward_month: input.birthdayRewardMonth ?? null,
          birthday_reward_day: input.birthdayRewardDay ?? null,
        }
  const { data: subjectMatch, error: subjectLookupError } = await service
    .from('mobile_users')
    .select('id,email,external_customer_subject,customer_code')
    .eq('external_customer_subject', input.customerSubject)
    .maybeSingle()
  if (subjectLookupError) {
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
  }
  if (subjectMatch) {
    if (subjectMatch.customer_code && subjectMatch.customer_code !== input.customerCode) {
      throw new CustomerIntegrationError('conflict', 'The loyalty identity does not match.', 409)
    }
    const { error: updateError } = await service
      .from('mobile_users')
      .update({
        customer_code: input.customerCode,
        email: normalizedEmail,
        customer_lifecycle_status: 'active',
        ...birthdayFields,
      })
      .eq('id', subjectMatch.id)
    if (updateError) {
      throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
    }
    return subjectMatch.id as string
  }

  // Keep each lookup in the typed query builder. Building a raw PostgREST
  // `.or()` expression with an email address would let filter punctuation
  // change the query grammar.
  const escapedEmail = normalizedEmail.replace(/[\\%_]/g, '\\$&')
  const [codeLookup, emailLookup] = await Promise.all([
    service
      .from('mobile_users')
      .select('id,email,external_customer_subject,customer_code')
      .eq('customer_code', input.customerCode)
      .maybeSingle(),
    service
      .from('mobile_users')
      .select('id,email,external_customer_subject,customer_code')
      .ilike('email', escapedEmail)
      .eq('customer_lifecycle_status', 'active')
      .maybeSingle(),
  ])
  if (codeLookup.error || emailLookup.error) {
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
  }
  if (codeLookup.data && emailLookup.data && codeLookup.data.id !== emailLookup.data.id) {
    throw new CustomerIntegrationError('conflict', 'The loyalty identity does not match.', 409)
  }
  const existing = codeLookup.data || emailLookup.data
  if (
    existing?.external_customer_subject &&
    existing.external_customer_subject !== input.customerSubject
  ) {
    throw new CustomerIntegrationError('conflict', 'The loyalty identity is already linked.', 409)
  }
  if (existing) {
    const { error } = await service
      .from('mobile_users')
      .update({
        external_customer_subject: input.customerSubject,
        customer_code: input.customerCode,
        email: normalizedEmail,
        customer_lifecycle_status: 'active',
        ...birthdayFields,
      })
      .eq('id', existing.id)
    if (error)
      throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
    return existing.id as string
  }

  const { data: created, error } = await service
    .from('mobile_users')
    .insert({
      id: input.customerSubject,
      email: normalizedEmail,
      external_customer_subject: input.customerSubject,
      customer_code: input.customerCode,
      customer_lifecycle_status: 'active',
      ...birthdayFields,
    })
    .select('id')
    .single()
  if (error || !created) {
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
  }
  return created.id as string
}

export async function deactivateCustomerLoyaltyAccount(input: {
  customerSubject: string
  customerCode: string
}) {
  const { data, error } = await getServiceSupabaseClient()
    .from('mobile_users')
    .update({
      customer_lifecycle_status: 'inactive',
      external_customer_subject: null,
    })
    .eq('external_customer_subject', input.customerSubject)
    .eq('customer_code', input.customerCode)
    .select('id')
    .maybeSingle()
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'The loyalty account could not be closed.',
      503,
    )
  }
  if (data) {
    await getServiceSupabaseClient()
      .from('customer_loyalty_referral_codes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('mobile_user_id', data.id)
  }
  return { loyaltyAccountDeactivated: Boolean(data) }
}

export async function customerLoyaltySummary(input: {
  customerSubject: string
  customerCode: string
  email: string
  birthdayRewardMonth?: number | null
  birthdayRewardDay?: number | null
}) {
  const mobileUserId = await customerMobileUser(input)
  const service = getServiceSupabaseClient()
  const [
    { data: awards, error },
    { data: balance, error: balanceError },
    { data: vouchers, error: voucherError },
    { data: referralRows, error: referralError },
    { data: referralCode, error: referralCodeError },
    configuration,
  ] = await Promise.all([
    service
      .from('customer_loyalty_awards')
      .select(
        'id,source_type,description,points,state,activation_milestone,created_at,activated_at',
      )
      .eq('mobile_user_id', mobileUserId)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('customer_loyalty_staff_member_summary')
      .select('available_points,pending_points,rank_points')
      .eq('id', mobileUserId)
      .single(),
    service
      .from('customer_loyalty_vouchers')
      .select('id,voucher_code,points_cost,value_pence,status,issued_at,expires_at,redeemed_at')
      .eq('mobile_user_id', mobileUserId)
      .order('issued_at', { ascending: false })
      .limit(100),
    service
      .from('customer_loyalty_referrals')
      .select('status')
      .eq('referrer_mobile_user_id', mobileUserId),
    service.rpc('customer_loyalty_ensure_referral_code_v1', {
      p_mobile_user_id: mobileUserId,
    }),
    loadLoyaltyProgramConfiguration({ allowFallback: false }).catch(() => {
      throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
    }),
  ])
  if (error || balanceError)
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
  // Voucher issuance and referrals are independent capabilities. A referral
  // setup failure must never hide otherwise healthy voucher rewards.
  const vouchersReady = !voucherError
  const referralsReady = !referralError && !referralCodeError
  const entries = (awards ?? []).map((award) => ({
    entryId: customerLoyaltyEntryId(award.id),
    occurredAt: new Date(award.created_at).toISOString(),
    description: String(award.description).slice(0, 180),
    points: Number(award.points),
    state: award.state as 'pending' | 'available' | 'reversed',
    sourceType: award.source_type as LoyaltySource,
  }))
  // The history is deliberately capped for payload size, but balances are
  // aggregated by Postgres across the complete immutable award stream.
  const pendingPoints = Number(balance.pending_points || 0)
  const availablePoints = Number(balance.available_points || 0)
  const rankPoints = Number(balance.rank_points || 0)
  const { data: expiry, error: expiryError } = await service.rpc(
    'customer_loyalty_expiry_summary_v1',
    {
      p_mobile_user_id: mobileUserId,
      p_validity_months: configuration.program.pointValidityMonths,
    },
  )
  if (expiryError)
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Loyalty expiry could not be loaded.',
      503,
    )
  const expirySummary = (expiry || {}) as { nextExpiryAt?: string | null; expiringPoints?: number }
  const nextExpiryAt = expirySummary.nextExpiryAt ? new Date(expirySummary.nextExpiryAt) : null
  const expiringPoints = Number(expirySummary.expiringPoints || 0)
  const currentRank = [...configuration.program.ranks]
    .reverse()
    .find((candidate) => Math.max(0, rankPoints) >= candidate.minimumPoints)
  const year = new Date().getUTCFullYear()
  const [{ data: achievementRows, error: achievementError }, { data: badgeRows, error: badgeError }, { count: walkInUsed, error: walkInError }] = await Promise.all([
    service.from('customer_loyalty_achievements').select('achievement_key,status,earned_at').eq('mobile_user_id', mobileUserId),
    service.from('customer_loyalty_rank_badges').select('rank_key,first_reached_at').eq('mobile_user_id', mobileUserId),
    service.from('customer_loyalty_walkin_usages').select('id', { count: 'exact', head: true }).eq('mobile_user_id', mobileUserId).eq('programme_year', year).eq('consumes_allowance', true),
  ])
  if (achievementError || badgeError || walkInError) {
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty benefits could not be loaded.', 503)
  }
  const achievementByKey = new Map((achievementRows ?? []).map((row) => [row.achievement_key, row] as const))
  const validTransactions = (awards ?? []).filter((award) =>
    ['ticket', 'service', 'package'].includes(award.source_type) &&
    award.state === 'available' &&
    !String(award.activation_milestone).startsWith('achievement_'),
  ).length
  const nextReset = new Date(Date.UTC(year + 1, 0, 1)).toISOString()
  return {
    customerCode: input.customerCode,
    tier: String(currentRank?.name || 'Member').slice(0, 80),
    pendingPoints: Math.max(0, pendingPoints),
    availablePoints: Math.max(0, availablePoints),
    rankPoints: Math.max(0, rankPoints),
    expiringPoints: Math.max(0, expiringPoints),
    nextExpiryAt: nextExpiryAt?.toISOString() ?? null,
    redemptionEnabled: vouchersReady && configuration.program.rollout.voucherIssuanceActive,
    expiryEnabled: configuration.program.rollout.expiryActive,
    program: configuration.program,
    vouchers: vouchersReady
      ? (vouchers ?? []).map((voucher) => ({
          voucherId: voucher.id,
          code: voucher.voucher_code,
          pointsCost: Number(voucher.points_cost),
          valuePence: Number(voucher.value_pence),
          status: voucher.status,
          issuedAt: new Date(voucher.issued_at).toISOString(),
          expiresAt: new Date(voucher.expires_at).toISOString(),
          redeemedAt: voucher.redeemed_at ? new Date(voucher.redeemed_at).toISOString() : null,
        }))
      : [],
    referral: referralsReady
      ? {
          referralCode: String(referralCode),
          authenticatedReferrals: (referralRows ?? []).filter((row) =>
            ['authenticated', 'rewarded'].includes(row.status),
          ).length,
          rewardedReferrals: (referralRows ?? []).filter((row) => row.status === 'rewarded').length,
        }
      : null,
    achievements: configuration.program.achievementRules.filter((rule) => rule.isActive).map((rule) => {
      const award = achievementByKey.get(rule.key)
      return {
        ...rule,
        progress: Math.min(validTransactions, rule.requiredTransactions),
        status: award?.status === 'earned' ? 'earned' as const : award?.status === 'suspended' ? 'suspended' as const : 'locked' as const,
        earnedAt: award?.earned_at ? new Date(award.earned_at).toISOString() : null,
      }
    }),
    rankBadges: (badgeRows ?? []).flatMap((badge) => {
      const rank = configuration.program.ranks.find((candidate) => candidate.key === badge.rank_key)
      return rank ? [{ key: rank.key, name: rank.name, colour: rank.colour, firstReachedAt: new Date(badge.first_reached_at).toISOString(), isCurrent: rank.key === currentRank?.key }] : []
    }),
    walkIn: {
      programmeYear: year,
      allowance: currentRank?.walkInAllowance ?? 0,
      used: Number(walkInUsed ?? 0),
      remaining: Math.max(0, (currentRank?.walkInAllowance ?? 0) - Number(walkInUsed ?? 0)),
      eligibleServiceTypes: ['nadra', 'passport'] as const,
      resetAt: nextReset,
    },
    entries,
    updatedAt: new Date().toISOString(),
  }
}

export async function onboardCustomerLoyalty(input: {
  customerSubject: string
  customerCode: string
  email: string
  birthdayRewardMonth: number | null
  birthdayRewardDay: number | null
  referralCode: string | null
  accountCreatedAt: string
}) {
  const mobileUserId = await customerMobileUser(input)
  let referral = { status: 'not_supplied', bonusAwarded: false }
  if (input.referralCode) {
    const accountAge = Date.now() - Date.parse(input.accountCreatedAt)
    if (!Number.isFinite(accountAge) || accountAge > 7 * 24 * 60 * 60 * 1000) {
      throw new CustomerIntegrationError(
        'conflict',
        'Referral links are for new customer accounts.',
        409,
      )
    }
    const { data, error } = await getServiceSupabaseClient().rpc(
      'customer_loyalty_accept_referral_v1',
      {
        p_referral_code: input.referralCode,
        p_referred_mobile_user_id: mobileUserId,
      },
    )
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('not found')) {
        throw new CustomerIntegrationError('not_found', 'Referral link is not valid.', 404)
      }
      if (message.includes('themselves') || message.includes('different referrer')) {
        throw new CustomerIntegrationError('conflict', 'This referral cannot be applied.', 409)
      }
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Referral could not be applied.',
        503,
      )
    }
    referral = data as typeof referral
  }
  const { data: referralCode, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_ensure_referral_code_v1',
    { p_mobile_user_id: mobileUserId },
  )
  if (error) {
    throw new CustomerIntegrationError('service_unavailable', 'Referral could not be loaded.', 503)
  }
  return { referralCode: String(referralCode), referral }
}

export async function issueCustomerLoyaltyVoucher(input: {
  customerSubject: string
  customerCode: string
  email: string
  pointsCost: number
  idempotencyKey: string
}) {
  const mobileUserId = await customerMobileUser(input)
  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_issue_voucher_v1',
    {
      p_mobile_user_id: mobileUserId,
      p_points_cost: input.pointsCost,
      p_idempotency_key: input.idempotencyKey,
    },
  )
  if (error || !data) {
    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('insufficient')) {
      throw new CustomerIntegrationError(
        'conflict',
        'You do not have enough available points.',
        409,
      )
    }
    if (message.includes('unavailable')) {
      throw new CustomerIntegrationError('not_found', 'That voucher reward is unavailable.', 404)
    }
    throw new CustomerIntegrationError('service_unavailable', 'Voucher could not be issued.', 503)
  }
  const voucher = data as Record<string, unknown>
  return {
    voucherId: String(voucher.id),
    code: String(voucher.voucher_code),
    pointsCost: Number(voucher.points_cost),
    valuePence: Number(voucher.value_pence),
    status: String(voucher.status),
    issuedAt: new Date(String(voucher.issued_at)).toISOString(),
    expiresAt: new Date(String(voucher.expires_at)).toISOString(),
    redeemedAt: voucher.redeemed_at ? new Date(String(voucher.redeemed_at)).toISOString() : null,
  }
}
