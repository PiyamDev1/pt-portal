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
import { onboardCustomerLoyalty } from '@/lib/customerPortal/loyalty'

const inputSchema = z
  .object({
    customerSubject: z.string().uuid(),
    customerCode: z
      .string()
      .regex(/^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$/),
    email: z.string().email(),
    birthdayRewardMonth: z.number().int().min(1).max(12).nullable(),
    birthdayRewardDay: z.number().int().min(1).max(31).nullable(),
    referralCode: z
      .string()
      .regex(/^PREF-[A-F0-9]{16}$/)
      .nullable(),
    accountCreatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((value) => (value.birthdayRewardMonth === null) === (value.birthdayRewardDay === null), {
    message: 'Birthday reward preference is incomplete.',
  })

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(context, 'customer-loyalty-onboarding')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const result = await onboardCustomerLoyalty(input)
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
