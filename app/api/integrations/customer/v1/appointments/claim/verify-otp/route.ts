import { z } from 'zod'

import { verifyAppointmentClaim } from '@/lib/customerPortal/appointments'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
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

const inputSchema = z
  .object({
    challengeId: z.string().uuid(),
    otp: z.string().regex(/^\d{6,8}$/),
    customerSubject: z.string().uuid(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'appointment-claim-verify-otp')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await verifyAppointmentClaim(input)
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'appointment_account_linked',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'appointment',
    outcome: 'success',
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
