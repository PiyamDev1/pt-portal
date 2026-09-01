import { z } from 'zod'

import { customerAvailableDates } from '@/lib/customerPortal/appointments'
import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'

const inputSchema = z
  .object({
    serviceId: z.string().uuid(),
    branchId: z.string().uuid(),
    groupSize: z.number().int().min(1).max(100),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const dates = await customerAvailableDates({
    servicePublicId: input.serviceId,
    branchPublicId: input.branchId,
    groupSize: input.groupSize,
  })
  return customerIntegrationOk(dates, context.requestId)
})
