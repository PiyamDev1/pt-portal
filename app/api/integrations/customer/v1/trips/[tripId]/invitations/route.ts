import { createHash } from 'node:crypto'

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
import { maskCustomerEmail, sendCustomerTripInvitation } from '@/lib/customerPortal/otpEmail'
import {
  createTripInvitationToken,
  invitationTokenHash,
  packageByInternalId,
} from '@/lib/customerPortal/trips'

const inputSchema = z
  .object({
    email: z.string().trim().email(),
    canViewFinancials: z.boolean(),
    inviterSubject: z.string().uuid(),
    accountGrant: z.string().min(40).max(2048),
    inviterName: z.string().trim().min(1).max(100).optional(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(
  async (request, context: { params: Promise<{ tripId: string }> }) => {
    const auth = await authenticateCustomerIntegration(request, { requireIdempotency: true })
    const claim = await claimCustomerIdempotency(auth, 'trip-invitation-create')
    if (claim.cached) {
      return customerIntegrationCached(claim.cached.body, claim.cached.status, auth.requestId)
    }
    const input = parseIntegrationJson(auth, (value) => inputSchema.parse(value))
    const { tripId } = await context.params
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
        'Only the lead customer can invite travellers.',
        403,
      )
    }
    const row = await packageByInternalId(grant.internalId)
    const token = createTripInvitationToken()
    const publicId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const email = input.email.trim().toLocaleLowerCase('en-GB')
    const { error } = await getServiceSupabaseClient()
      .from('customer_portal_trip_invitations')
      .insert({
        public_id: publicId,
        trip_id: row.id,
        inviter_subject: input.inviterSubject,
        invitee_email: email,
        invitee_email_hash: createHash('sha256').update(email).digest('base64url'),
        token_hash: invitationTokenHash(token),
        requested_financial_scope: input.canViewFinancials,
        expires_at: expiresAt,
      })
    if (error) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'The invitation could not be created.',
        503,
      )
    }
    try {
      await sendCustomerTripInvitation({
        to: email,
        inviterName: input.inviterName,
        packageReference: row.package_reference,
        token,
      })
    } catch (error) {
      await getServiceSupabaseClient()
        .from('customer_portal_trip_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('public_id', publicId)
      throw error
    }
    const result = {
      invitationId: publicId,
      emailMasked: maskCustomerEmail(email),
      expiresAt,
    }
    await recordCustomerPortalAudit({
      requestId: auth.requestId,
      eventType: 'trip_invitation_created',
      actorKind: 'customer',
      customerSubject: input.inviterSubject,
      resourceType: 'trip',
      resourcePublicId: tripId,
      outcome: 'success',
      metadata: { invitationPublicId: publicId, financialScopeRequested: input.canViewFinancials },
    })
    const body = { data: result, error: null, requestId: auth.requestId }
    await claim.complete(201, body)
    return customerIntegrationOk(result, auth.requestId, { status: 201 })
  },
)
