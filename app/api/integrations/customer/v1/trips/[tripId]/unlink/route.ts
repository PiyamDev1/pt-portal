import { z } from 'zod'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import { resolveResourceAlias, verifyCustomerAccessGrant } from '@/lib/customerPortal/grants'
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
import {
  type CustomerLoyaltyUnlinkResult,
  unlinkCustomerLoyaltySource,
} from '@/lib/customerPortal/loyaltyLifecycleServer'

const inputSchema = z
  .object({
    customerSubject: z.string().uuid(),
    journeyKind: z.enum(['ticket', 'package']),
    accountGrant: z.string().min(40).max(2048).optional(),
  })
  .strict()

export const DELETE = withCustomerIntegrationRoute<{
  params: Promise<{ tripId: string }>
}>(async (request, routeContext) => {
  const auth = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const claim = await claimCustomerIdempotency(auth, 'trip-account-unlink')
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, auth.requestId)
  }
  const { tripId } = await routeContext.params
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) {
    throw new CustomerIntegrationError('not_found', 'Trip not found.', 404)
  }
  const input = parseIntegrationJson(auth, (value) => inputSchema.parse(value))
  let internalId: string
  let loyalty: CustomerLoyaltyUnlinkResult
  if (input.journeyKind === 'package') {
    if (!input.accountGrant) {
      throw new CustomerIntegrationError('not_found', 'Trip not found.', 404)
    }
    const grant = await verifyCustomerAccessGrant({
      token: input.accountGrant,
      resourceType: 'trip',
      publicId: tripId,
      requiredScope: 'read',
      customerSubject: input.customerSubject,
    })
    internalId = grant.internalId
    loyalty = grant.scopes.includes('lead')
      ? await unlinkCustomerLoyaltySource({
          customerSubject: input.customerSubject,
          source: { type: 'package', recordId: internalId },
        })
      : {
          unlinked: true as const,
          sourceHadPoints: false,
          removedPoints: 0,
          retainedRedeemedPoints: 0,
        }
  } else {
    const alias = await resolveResourceAlias('trip', tripId)
    if (alias.metadata.source !== 'ticketing_ledger') {
      throw new CustomerIntegrationError('not_found', 'Trip not found.', 404)
    }
    internalId = alias.internalId
    const { data: transactions, error: transactionError } = await getServiceSupabaseClient()
      .from('ticket_transactions')
      .select('id')
      .eq('booking_id', internalId)
      .eq('service_type', 'TK')
      .is('parent_transaction_id', null)
    if (transactionError) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Ticket loyalty could not be reconciled.',
        503,
      )
    }
    const results = await Promise.all(
      (transactions || []).map((transaction) =>
        unlinkCustomerLoyaltySource({
          customerSubject: input.customerSubject,
          source: { type: 'ticket', recordId: transaction.id },
        }),
      ),
    )
    loyalty = {
      unlinked: true as const,
      sourceHadPoints: results.some((result) => result.sourceHadPoints),
      removedPoints: results.reduce((total, result) => total + result.removedPoints, 0),
      retainedRedeemedPoints: results.reduce(
        (total, result) => total + result.retainedRedeemedPoints,
        0,
      ),
    }
  }
  const revokedAt = new Date().toISOString()
  const { error: revokeError } = await getServiceSupabaseClient()
    .from('customer_portal_access_grants')
    .update({ revoked_at: revokedAt })
    .eq('resource_type', 'trip')
    .eq('internal_id', internalId)
    .eq('public_id', tripId)
    .eq('customer_subject', input.customerSubject)
    .is('revoked_at', null)
  if (revokeError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Trip access could not be removed.',
      503,
    )
  }

  const result = { unlinked: true as const, loyalty }
  await recordCustomerPortalAudit({
    requestId: auth.requestId,
    eventType: 'trip_account_unlinked',
    actorKind: 'customer',
    customerSubject: input.customerSubject,
    resourceType: 'trip',
    resourcePublicId: tripId,
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
