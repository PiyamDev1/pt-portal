import { z } from 'zod'

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
import { issueCustomerLoyaltyVoucher } from '@/lib/customerPortal/loyalty'

const inputSchema = z
  .object({
    customerSubject: z.string().uuid(),
    customerCode: z
      .string()
      .regex(/^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$/),
    email: z.string().email(),
    pointsCost: z.number().int().min(1).max(1_000_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'customer-loyalty-voucher-issue')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await issueCustomerLoyaltyVoucher(input)
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(201, body)
  return customerIntegrationOk(result, context.requestId, { status: 201 })
})
