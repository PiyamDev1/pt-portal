import { z } from 'zod'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { verifyCustomerAccessGrant } from '@/lib/customerPortal/grants'
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

const inputSchema = z
  .object({
    inviterSubject: z.string().uuid(),
    accountGrant: z.string().min(40).max(2048),
  })
  .strict()

export const DELETE = withCustomerIntegrationRoute<{
  params: Promise<{ tripId: string; invitationId: string }>
}>(async (request, routeContext) => {
  const auth = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const { tripId, invitationId } = await routeContext.params
  if (!/^[0-9a-f-]{36}$/i.test(tripId) || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    throw new CustomerIntegrationError('not_found', 'Invitation not found.', 404)
  }
  const claim = await claimCustomerIdempotency(auth, 'trip-invitation-revoke')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, auth.requestId)
  }
  const input = parseIntegrationJson(auth, (value) => inputSchema.parse(value))
  const grant = await verifyCustomerAccessGrant({
    token: input.accountGrant,
    resourceType: 'trip',
    publicId: tripId,
    requiredScope: 'invite',
    customerSubject: input.inviterSubject,
  })
  if (!grant.scopes.includes('lead')) {
    throw new CustomerIntegrationError(
      'forbidden',
      'Only the lead customer can revoke invitations.',
      403,
    )
  }
  const service = getServiceSupabaseClient()
  const { data: invitation, error } = await service
    .from('customer_portal_trip_invitations')
    .select('id,accepted_subject,revoked_at')
    .eq('public_id', invitationId)
    .eq('trip_id', grant.internalId)
    .eq('inviter_subject', input.inviterSubject)
    .maybeSingle()
  if (error || !invitation) {
    throw new CustomerIntegrationError('not_found', 'Invitation not found.', 404)
  }
  const revokedAt = invitation.revoked_at || new Date().toISOString()
  if (!invitation.revoked_at) {
    const { error: revokeError } = await service
      .from('customer_portal_trip_invitations')
      .update({ revoked_at: revokedAt })
      .eq('id', invitation.id)
      .is('revoked_at', null)
    if (revokeError) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Invitation could not be revoked.',
        503,
      )
    }
  }
  if (invitation.accepted_subject) {
    const { error: grantRevokeError } = await service
      .from('customer_portal_access_grants')
      .update({ revoked_at: revokedAt })
      .eq('resource_type', 'trip')
      .eq('internal_id', grant.internalId)
      .eq('customer_subject', invitation.accepted_subject)
      .is('revoked_at', null)
    if (grantRevokeError) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Invitation access could not be revoked.',
        503,
      )
    }
  }
  const result = { revoked: true as const }
  await recordCustomerPortalAudit({
    requestId: auth.requestId,
    eventType: 'trip_invitation_revoked',
    actorKind: 'customer',
    customerSubject: input.inviterSubject,
    resourceType: 'trip',
    resourcePublicId: tripId,
    outcome: 'success',
    metadata: { invitationPublicId: invitationId },
  })
  const body = { data: result, error: null, requestId: auth.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, auth.requestId)
})
