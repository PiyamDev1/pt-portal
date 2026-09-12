import { z } from 'zod'

import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'
import { validateCustomerLoyaltyReferralCode } from '@/lib/customerPortal/loyalty'

const inputSchema = z
  .object({
    referralCode: z.string().regex(/^PREF-[A-F0-9]{16}$/),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await validateCustomerLoyaltyReferralCode(input.referralCode)
  return customerIntegrationOk(result, context.requestId)
})
