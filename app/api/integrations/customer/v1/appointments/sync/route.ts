import { z } from 'zod'

import { syncCustomerAppointments } from '@/lib/customerPortal/appointments'
import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'

const schema = z
  .object({
    customerSubject: z.string().uuid(),
    verifiedEmail: z.string().trim().email(),
    knownGrantReferences: z.array(z.string().regex(/^[A-Za-z0-9_-]{8,80}$/)).max(100),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => schema.parse(value))
  return customerIntegrationOk(await syncCustomerAppointments(input), context.requestId)
})
