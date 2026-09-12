import { z } from 'zod'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { verifyCustomerAccessGrant } from '@/lib/customerPortal/grants'
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
import { unlinkCustomerLoyaltySource } from '@/lib/customerPortal/loyaltyLifecycleServer'

const inputSchema = z
  .object({
    customerSubject: z.string().uuid(),
    accountGrant: z.string().min(40).max(2048),
  })
  .strict()

const applicationSources = ['nadra', 'pak_passport', 'gb_passport', 'visa'] as const

export const DELETE = withCustomerIntegrationRoute<{
  params: Promise<{ applicationId: string }>
}>(async (request, routeContext) => {
  const auth = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(auth, 'application-account-unlink')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, auth.requestId)
  }
  const { applicationId } = await routeContext.params
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) {
    throw new CustomerIntegrationError('not_found', 'Application not found.', 404)
  }
  const input = parseIntegrationJson(auth, (value) => inputSchema.parse(value))
  const grant = await verifyCustomerAccessGrant({
    token: input.accountGrant,
    resourceType: 'application',
    publicId: applicationId,
    requiredScope: 'read',
    customerSubject: input.customerSubject,
  })
  const source = applicationSources.find((candidate) => candidate === grant.metadata.source)
  if (!source) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Application access could not be reconciled.',
      503,
    )
  }

  const loyalty = await unlinkCustomerLoyaltySource({
    customerSubject: input.customerSubject,
    source: {
      type: 'service',
      namespace: source,
      recordId: grant.internalId,
    },
  })
  const revokedAt = new Date().toISOString()
  const { error: revokeError } = await getServiceSupabaseClient()
    .from('customer_portal_access_grants')
    .update({ revoked_at: revokedAt })
    .eq('resource_type', 'application')
    .eq('internal_id', grant.internalId)
    .eq('public_id', applicationId)
    .eq('customer_subject', input.customerSubject)
    .is('revoked_at', null)
  if (revokeError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Application access could not be removed.',
      503,
    )
  }

  const result = { unlinked: true as const, loyalty }
  await recordCustomerPortalAudit({
    requestId: auth.requestId,
    eventType: 'application_account_unlinked',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'application',
    resourcePublicId: applicationId,
    outcome: 'success',
    metadata: {
      removedPoints: loyalty.removedPoints,
      retainedRedeemedPoints: loyalty.retainedRedeemedPoints,
    },
  })
  const body = { data: result, error: null, requestId: auth.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(result, auth.requestId)
})
