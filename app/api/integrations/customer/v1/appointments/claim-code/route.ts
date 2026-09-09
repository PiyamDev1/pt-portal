import { z } from 'zod'

import { claimCustomerAppointmentByGuestCode } from '@/lib/customerPortal/appointments'
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

const schema = z
  .object({
    customerSubject: z.string().uuid(),
    guestCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^VISIT-[A-F0-9]{12}$/),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const claim = await claimCustomerIdempotency(context, 'appointment-claim-guest-code')
  if (claim.cached)
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  const input = parseIntegrationJson(context, (value) => schema.parse(value))
  const result = await claimCustomerAppointmentByGuestCode(input)
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
