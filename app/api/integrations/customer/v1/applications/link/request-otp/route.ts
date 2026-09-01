import { z } from 'zod'

import { customerApplicationFromPublicId } from '@/lib/customerPortal/applications'
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
import { createCustomerOtpChallenge } from '@/lib/customerPortal/otp'

const inputSchema = z
  .object({
    applicationId: z.string().uuid(),
    guestGrant: z.string().min(40).max(2048),
    customerSubject: z.string().uuid(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'application-link-request-otp')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  await verifyCustomerAccessGrant({
    token: input.guestGrant,
    resourceType: 'application',
    publicId: input.applicationId,
    requiredScope: 'request_link_otp',
  })
  const application = await customerApplicationFromPublicId(input.applicationId)
  if (!application.contactEmail) {
    throw new CustomerIntegrationError(
      'conflict',
      'No verified email is recorded. Contact Piyam Travel for staff-assisted linking.',
      409,
    )
  }
  const result = await createCustomerOtpChallenge({
    purpose: 'link_application',
    resourceType: 'application',
    internalId: application.candidate.internalId,
    publicId: input.applicationId,
    customerSubject: input.customerSubject,
    contactEmail: application.contactEmail,
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
