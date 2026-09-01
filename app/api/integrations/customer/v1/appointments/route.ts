import { z } from 'zod'

import { createCustomerAppointment } from '@/lib/customerPortal/appointments'
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
    serviceId: z.string().uuid(),
    branchId: z.string().uuid(),
    slotId: z.string().uuid(),
    contactName: z.string().trim().min(2).max(100),
    contactEmail: z.string().trim().email(),
    contactPhone: z.string().trim().min(5).max(40),
    groupSize: z.number().int().min(1).max(100),
    turnstileToken: z.string().max(2048).optional(),
    customerSubject: z.string().uuid().nullable(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'appointment-create')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await createCustomerAppointment({
    slotPublicId: input.slotId,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    groupSize: input.groupSize,
    customerSubject: input.customerSubject,
  })
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'appointment_created',
    actorKind: input.customerSubject ? 'customer' : 'guest',
    customerSubject: input.customerSubject,
    resourceType: 'appointment',
    outcome: 'success',
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(201, body)
  return customerIntegrationOk(result, context.requestId, { status: 201 })
})
