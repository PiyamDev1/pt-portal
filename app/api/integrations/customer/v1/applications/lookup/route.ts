import { z } from 'zod'

import { lookupCustomerApplication } from '@/lib/customerPortal/applications'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { createCustomerAccessGrant } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'

const inputSchema = z
  .object({
    trackingNumber: z
      .string()
      .trim()
      .min(4)
      .max(80)
      .regex(/^[\p{L}\p{N}\s'’\-/.]+$/u),
    surname: z.string().trim().min(1).max(100),
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await lookupCustomerApplication(input.trackingNumber, input.surname)
  const guestGrant = await createCustomerAccessGrant({
    resourceType: 'application',
    internalId: result.candidate.internalId,
    publicId: result.publicId,
    scopes: ['read', 'request_link_otp'],
    ttlSeconds: 30 * 60,
    metadata: { source: result.candidate.source },
  })
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'application_guest_lookup',
    actorKind: 'guest',
    resourceType: 'application',
    resourcePublicId: result.publicId,
    outcome: 'success',
  })
  return customerIntegrationOk({ summary: result.summary, guestGrant }, context.requestId)
})
