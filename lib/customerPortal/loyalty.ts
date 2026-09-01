import 'server-only'

import { createHash } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
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

export async function customerLoyaltySummary(input: {
  customerSubject: string
  customerCode: string
  email: string
}) {
  const mobileUserId = await customerMobileUser(input)
  const service = getServiceSupabaseClient()
  const [{ data: awards, error }, { data: tiers }] = await Promise.all([
    service
      .from('customer_loyalty_awards')
      .select('id,source_type,description,points,state,created_at')
      .eq('mobile_user_id', mobileUserId)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('loyalty_tiers')
      .select('tier_name,min_points_threshold')
      .order('min_points_threshold', { ascending: false }),
  ])
  if (error)
    throw new CustomerIntegrationError('service_unavailable', 'Loyalty is unavailable.', 503)
  const entries = (awards ?? []).map((award) => ({
    entryId: customerLoyaltyEntryId(award.id),
    occurredAt: new Date(award.created_at).toISOString(),
    description: String(award.description).slice(0, 180),
    points: Number(award.points),
    state: award.state as 'pending' | 'available' | 'reversed',
    sourceType: award.source_type as LoyaltySource,
  }))
  const pendingPoints = entries
    .filter((entry) => entry.state === 'pending')
    .reduce((sum, entry) => sum + entry.points, 0)
  const availablePoints = entries
    .filter((entry) => entry.state === 'available')
    .reduce((sum, entry) => sum + entry.points, 0)
  const tier = (tiers ?? []).find(
    (candidate) => availablePoints >= Number(candidate.min_points_threshold),
  )?.tier_name
  return {
    customerCode: input.customerCode,
    tier: String(tier || 'Member').slice(0, 80),
    pendingPoints: Math.max(0, pendingPoints),
    availablePoints: Math.max(0, availablePoints),
    redemptionEnabled: false as const,
    expiryEnabled: false as const,
    entries,
    updatedAt: new Date().toISOString(),
  }
}
