import { z } from 'zod'

import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { createCustomerAccessGrant } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  claimCustomerIdempotency,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  customerIntegrationCached,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'
import { verifyCustomerOtpChallenge } from '@/lib/customerPortal/otp'
import { customerTripSummary } from '@/lib/customerPortal/trips'

const inputSchema = z
  .object({
    challengeId: z.string().uuid(),
    otp: z.string().regex(/^\d{6,8}$/),
    customerSubject: z.string().uuid(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const claim = await claimCustomerIdempotency(context, 'trip-link-verify-otp')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const verified = await verifyCustomerOtpChallenge({
    challengeId: input.challengeId,
    code: input.otp,
    customerSubject: input.customerSubject,
    purpose: 'link_trip',
  })
  const scopes = ['read', 'documents', 'financials', 'lead', 'invite']
  const grantedAt = new Date().toISOString()
  const accountGrant = await createCustomerAccessGrant({
    resourceType: 'trip',
    internalId: verified.internalId,
    publicId: verified.publicId,
    customerSubject: input.customerSubject,
    scopes,
    ttlSeconds: 365 * 24 * 60 * 60,
    metadata: { source: 'lead_contact_otp', grantedAt },
  })
  const trip = await customerTripSummary({
    internalId: verified.internalId,
    publicId: verified.publicId,
    scopes,
    grantedAt,
  })
  const result = {
    trip,
    accountGrant: accountGrant.token,
    grantExpiresAt: accountGrant.expiresAt,
  }
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'trip_account_linked',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'trip',
    resourcePublicId: verified.publicId,
    outcome: 'success',
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
