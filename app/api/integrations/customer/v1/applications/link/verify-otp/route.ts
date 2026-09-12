import { z } from 'zod'

import { customerApplicationFromPublicId } from '@/lib/customerPortal/applications'
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
import {
  configuredCustomerLoyaltyPoints,
  registerCustomerLoyaltySourceForCode,
} from '@/lib/customerPortal/loyaltyLifecycleServer'

const inputSchema = z
  .object({
    challengeId: z.string().uuid(),
    otp: z.string().regex(/^\d{6,8}$/),
    customerSubject: z.string().uuid(),
    customerCode: z.string().min(8).max(40),
    claimLoyalty: z.boolean().default(false),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'application-link-verify-otp')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const verified = await verifyCustomerOtpChallenge({
    challengeId: input.challengeId,
    code: input.otp,
    customerSubject: input.customerSubject,
    purpose: 'link_application',
  })
  const application = await customerApplicationFromPublicId(verified.publicId)
  const accountGrant = await createCustomerAccessGrant({
    resourceType: 'application',
    internalId: verified.internalId,
    publicId: verified.publicId,
    customerSubject: input.customerSubject,
    scopes: ['read', 'notifications'],
    ttlSeconds: 365 * 24 * 60 * 60,
    metadata: { source: application.candidate.source },
  })
  const loyaltyClaim = input.claimLoyalty
    ? await (async () => {
        const points = await configuredCustomerLoyaltyPoints('application')
        const registered = await registerCustomerLoyaltySourceForCode({
          customerCode: input.customerCode,
          source: {
            type: 'service',
            namespace: application.candidate.source,
            recordId: verified.internalId,
          },
          description: `${application.summary.serviceType} application`,
          points,
          serviceKey: 'application',
        })
        return registered.award
          ? { points, activationMilestone: registered.activationMilestone }
          : null
      })()
    : null
  const result = {
    application: { ...application.summary, saved: true },
    accountGrant: accountGrant.token,
    grantExpiresAt: accountGrant.expiresAt,
    loyaltyClaim,
  }
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'application_account_linked',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'application',
    resourcePublicId: verified.publicId,
    outcome: 'success',
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
