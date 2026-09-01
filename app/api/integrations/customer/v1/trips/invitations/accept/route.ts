import { createHash, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { createCustomerAccessGrant, getOrCreateResourceAlias } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  claimCustomerIdempotency,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  CustomerIntegrationError,
  customerIntegrationCached,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'
import { customerTripSummary, invitationTokenHash } from '@/lib/customerPortal/trips'

const inputSchema = z
  .object({
    token: z.string().regex(/^pti_[A-Za-z0-9_-]{40,100}$/),
    customerSubject: z.string().uuid(),
    customerEmail: z.string().email(),
    ageBand: z.enum(['age_16_17', 'adult']),
  })
  .strict()

function equalEmail(left: string, right: string) {
  const leftDigest = createHash('sha256').update(left.trim().toLocaleLowerCase('en-GB')).digest()
  const rightDigest = createHash('sha256').update(right.trim().toLocaleLowerCase('en-GB')).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

export const POST = withCustomerIntegrationRoute(async (request) => {
  const auth = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const claim = await claimCustomerIdempotency(auth, 'trip-invitation-accept')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, auth.requestId)
  }
  const input = parseIntegrationJson(auth, (value) => inputSchema.parse(value))
  const service = getServiceSupabaseClient()
  const { data: invitation, error } = await service
    .from('customer_portal_trip_invitations')
    .select('*')
    .eq('token_hash', invitationTokenHash(input.token))
    .maybeSingle()
  if (
    error ||
    !invitation ||
    invitation.revoked_at ||
    Date.parse(invitation.expires_at) <= Date.now() ||
    !equalEmail(invitation.invitee_email, input.customerEmail) ||
    (invitation.accepted_subject && invitation.accepted_subject !== input.customerSubject)
  ) {
    throw new CustomerIntegrationError('not_found', 'Invitation is invalid or expired.', 404)
  }
  const canViewFinancials =
    Boolean(invitation.requested_financial_scope) && input.ageBand === 'adult'
  if (!invitation.accepted_at) {
    const { data: accepted, error: acceptError } = await service
      .from('customer_portal_trip_invitations')
      .update({
        accepted_subject: input.customerSubject,
        accepted_financial_scope: canViewFinancials,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .is('accepted_at', null)
      .select('id')
      .maybeSingle()
    if (acceptError || !accepted) {
      throw new CustomerIntegrationError('conflict', 'Invitation was already accepted.', 409)
    }
  }
  const alias = await getOrCreateResourceAlias('trip', invitation.trip_id)
  const scopes = ['read', 'documents', ...(canViewFinancials ? ['financials'] : [])]
  const grantedAt = invitation.accepted_at || new Date().toISOString()
  const grant = await createCustomerAccessGrant({
    resourceType: 'trip',
    internalId: invitation.trip_id,
    publicId: alias.publicId,
    customerSubject: input.customerSubject,
    scopes,
    ttlSeconds: 365 * 24 * 60 * 60,
    metadata: { source: 'family_invitation', invitationPublicId: invitation.public_id, grantedAt },
  })
  const trip = await customerTripSummary({
    internalId: invitation.trip_id,
    publicId: alias.publicId,
    scopes,
    grantedAt,
  })
  const result = {
    invitationId: invitation.public_id,
    trip,
    accountGrant: grant.token,
    grantExpiresAt: grant.expiresAt,
  }
  await recordCustomerPortalAudit({
    requestId: auth.requestId,
    eventType: 'trip_invitation_accepted',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'trip',
    resourcePublicId: alias.publicId,
    outcome: 'success',
    metadata: { financialScopeGranted: canViewFinancials },
  })
  const body = { data: result, error: null, requestId: auth.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, auth.requestId)
})
