import { z } from 'zod'

import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { createCustomerAccessGrant, getOrCreateResourceAlias } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  claimCustomerIdempotency,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  CustomerIntegrationError,
  customerIntegrationCached,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

const inputSchema = z.object({ token: z.string().min(20).max(2048) }).strict()

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request, { requireIdempotency: true })
  const claim = await claimCustomerIdempotency(context, 'trip-legacy-token-exchange')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const { data, error } = await getServiceSupabaseClient()
    .from('travel_packages')
    .select('id,document_access_enabled,document_access_expires_at')
    .eq('document_access_token', input.token)
    .maybeSingle()
  const expired = data?.document_access_expires_at
    ? Date.parse(data.document_access_expires_at) <= Date.now()
    : false
  if (error || !data || !data.document_access_enabled || expired) {
    throw new CustomerIntegrationError('not_found', 'Package link is invalid or expired.', 404)
  }
  const alias = await getOrCreateResourceAlias('trip', data.id)
  const grant = await createCustomerAccessGrant({
    resourceType: 'trip',
    internalId: data.id,
    publicId: alias.publicId,
    scopes: ['read', 'documents', 'financials', 'lead', 'invite'],
    ttlSeconds: 30 * 60,
    metadata: { source: 'legacy_package_token', grantedAt: new Date().toISOString() },
  })
  const result = { tripId: alias.publicId, guestGrant: grant.token, expiresAt: grant.expiresAt }
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: 'trip_legacy_token_exchanged',
    actorKind: 'guest',
    resourceType: 'trip',
    resourcePublicId: alias.publicId,
    outcome: 'success',
  })
  const body = { data: result, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, context.requestId)
})
