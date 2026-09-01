import { z } from 'zod'

import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'
import { customerLoyaltySummary } from '@/lib/customerPortal/loyalty'

const inputSchema = z
  .object({
    customerSubject: z.string().uuid(),
    customerCode: z
      .string()
      .regex(/^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$/),
    email: z.string().email(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  return customerIntegrationOk(await customerLoyaltySummary(input), context.requestId)
})
