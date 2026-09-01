import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export async function recordCustomerPortalAudit(event: {
  requestId: string
  eventType: string
  actorKind: 'customer_server' | 'guest' | 'customer' | 'system'
  customerSubject?: string | null
  resourceType?: string | null
  resourcePublicId?: string | null
  outcome: 'success' | 'denied' | 'error'
  metadata?: Record<string, unknown>
}) {
  const { error } = await getServiceSupabaseClient()
    .from('customer_portal_audit_events')
    .insert({
      request_id: event.requestId,
      event_type: event.eventType,
      actor_kind: event.actorKind,
      customer_subject: event.customerSubject ?? null,
      resource_type: event.resourceType ?? null,
      resource_public_id: event.resourcePublicId ?? null,
      outcome: event.outcome,
      metadata: event.metadata ?? {},
    })
  if (error) {
    console.error('Customer portal audit insert failed', {
      requestId: event.requestId,
      code: error.code,
    })
  }
}
