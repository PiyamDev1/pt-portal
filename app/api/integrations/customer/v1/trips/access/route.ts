import { z } from 'zod'

import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { createCustomerAccessGrant, getOrCreateResourceAlias } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'
import { customerTripSummary, lookupCustomerTrip } from '@/lib/customerPortal/trips'

const inputSchema = z
  .object({
    packageReference: z.string().trim().min(4).max(80),
    leadSurname: z.string().trim().min(1).max(100),
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const row = await lookupCustomerTrip(input.packageReference, input.leadSurname)
  const alias = await getOrCreateResourceAlias('trip', row.id)
  const grantedAt = new Date().toISOString()
  const scopes = ['read', 'documents', 'financials', 'lead', 'invite']
  const grant = await createCustomerAccessGrant({
    resourceType: 'trip',
    internalId: row.id,
    publicId: alias.publicId,
    scopes,
    ttlSeconds: 30 * 60,
    metadata: { source: 'reference_surname', grantedAt },
  })
  const trip = await customerTripSummary({
    internalId: row.id,
    publicId: alias.publicId,
    scopes,
    grantedAt,
  })
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'trip_guest_accessed',
    actorKind: 'guest',
    resourceType: 'trip',
    resourcePublicId: alias.publicId,
    outcome: 'success',
  })
  return customerIntegrationOk(
    { trip, guestGrant: { token: grant.token, expiresAt: grant.expiresAt } },
    context.requestId,
  )
})
