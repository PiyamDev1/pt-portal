import { z } from 'zod'

import { createCustomerOtpChallenge } from '@/lib/customerPortal/otp'
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
import { packageByInternalId } from '@/lib/customerPortal/trips'

const inputSchema = z
  .object({
    tripId: z.string().uuid(),
    guestGrant: z.string().min(40).max(2048),
    customerSubject: z.string().uuid(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const claim = await claimCustomerIdempotency(context, 'trip-link-request-otp')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const grant = await verifyCustomerAccessGrant({
    token: input.guestGrant,
    resourceType: 'trip',
    publicId: input.tripId,
    requiredScope: 'read',
  })
  const row = await packageByInternalId(grant.internalId)
  if (!row.customer_email) {
    throw new CustomerIntegrationError(
      'not_found',
      'Staff assistance is required to link this package.',
      404,
    )
  }
  const result = await createCustomerOtpChallenge({
    purpose: 'link_trip',
    resourceType: 'trip',
    internalId: row.id,
    publicId: input.tripId,
    customerSubject: input.customerSubject,
    contactEmail: row.customer_email,
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
