import 'server-only'

import { createHash } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { loadLoyaltyProgramConfiguration } from '@/lib/loyalty/programServer'
import { CustomerIntegrationError } from './http'

type LoyaltySource = 'ticket' | 'service' | 'package' | 'adjustment'

export function customerLoyaltyEntryId(internalId: string) {
  return `loy_${createHash('sha256').update(internalId).digest('base64url').slice(0, 24)}`
}

async function customerMobileUser(input: {
  customerSubject: string
  customerCode: string
  email: string
}) {
  const service = getServiceSupabaseClient()
  const normalizedEmail = input.email.trim().toLocaleLowerCase('en-GB')
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
  return { loyaltyAccountDeactivated: Boolean(data) }
}

export async function customerLoyaltySummary(input: {
  customerSubject: string
  customerCode: string
  email: string
}) {
  const mobileUserId = await customerMobileUser(input)
  const service = getServiceSupabaseClient()
  const [{ data: awards, error }, { data: balance, error: balanceError }, configuration] =
    await Promise.all([
      service
        .from('customer_loyalty_awards')
        .select('id,source_type,description,points,state,created_at,activated_at')
        .eq('mobile_user_id', mobileUserId)
        .order('created_at', { ascending: false })
        .limit(200),
      service
        .from('customer_loyalty_staff_member_summary')
        .select('available_points,pending_points')
        .eq('id', mobileUserId)
        .single(),
      loadLoyaltyProgramConfiguration(),
    ])
  if (error || balanceError)
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
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
  const expiringLots = (awards ?? [])
    .filter((award) => award.state === 'available' && Number(award.points) > 0)
    .map((award) => {
      const activatedAt = new Date(award.activated_at || award.created_at)
      const expiresAt = new Date(activatedAt)
      expiresAt.setUTCMonth(expiresAt.getUTCMonth() + configuration.program.pointValidityMonths)
      return { points: Number(award.points), expiresAt }
    })
    .filter((lot) => lot.expiresAt.getTime() > Date.now())
    .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
  const nextExpiryAt = expiringLots[0]?.expiresAt ?? null
  const expiringPoints = nextExpiryAt
    ? expiringLots
        .filter(
          (lot) =>
            lot.expiresAt.toISOString().slice(0, 10) === nextExpiryAt.toISOString().slice(0, 10),
        )
        .reduce((total, lot) => total + lot.points, 0)
    : 0
  const tier = [...configuration.program.ranks]
    .reverse()
    .find((candidate) => availablePoints >= candidate.minimumPoints)?.name
  return {
    customerCode: input.customerCode,
    tier: String(tier || 'Member').slice(0, 80),
    pendingPoints: Math.max(0, pendingPoints),
    availablePoints: Math.max(0, availablePoints),
    expiringPoints: Math.max(0, expiringPoints),
    nextExpiryAt: nextExpiryAt?.toISOString() ?? null,
    redemptionEnabled: false as const,
    expiryEnabled: false as const,
    program: configuration.program,
    entries,
    updatedAt: new Date().toISOString(),
  }
}
