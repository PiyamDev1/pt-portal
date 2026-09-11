import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { loadLoyaltyProgramConfiguration } from '@/lib/loyalty/programServer'
import { CustomerIntegrationError } from './http'
import {
  customerLoyaltyActivationMilestone,
  customerLoyaltySourceReference,
  normalizeCustomerLoyaltyCode,
  type CustomerLoyaltySource,
} from './loyaltyLifecycle'

function loyaltyWriteError() {
  return new CustomerIntegrationError(
    'service_unavailable',
    'The loyalty update could not be completed.',
    503,
  )
}

export async function configuredCustomerLoyaltyPoints(ruleKey: string) {
  const { program } = await loadLoyaltyProgramConfiguration({ allowFallback: false }).catch(() => {
    throw loyaltyWriteError()
  })
  const rule = program.earningRules.find((candidate) => candidate.key === ruleKey)
  if (!rule || rule.isActive === false || !Number.isSafeInteger(rule.points) || rule.points <= 0) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'This loyalty reward is unavailable.',
      503,
    )
  }
  return rule.points
}

export async function registerCustomerLoyaltySourceForCode(input: {
  customerCode: string
  source: CustomerLoyaltySource
  description: string
  points: number
  serviceKey: string
  branchId?: string | null
  spendPence?: number | null
  occurredAt?: string
}) {
  const sourceReference = customerLoyaltySourceReference(input.source)
  const customerCode = normalizeCustomerLoyaltyCode(input.customerCode)
  const description = input.description.trim()
  if (!description || description.length > 180) throw new Error('A short description is required.')
  if (!Number.isSafeInteger(input.points) || input.points <= 0) {
    throw new Error('Loyalty points must be a positive whole number.')
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_register_code_source_v1',
    {
      p_customer_code: customerCode,
      p_source_type: input.source.type,
      p_source_namespace: input.source.namespace?.trim().toLowerCase() || null,
      p_source_record_id: input.source.recordId,
      p_description: description,
      p_points: input.points,
    },
  )
  if (error) throw loyaltyWriteError()
  const campaignResult = await getServiceSupabaseClient().rpc(
    'customer_loyalty_apply_sale_campaigns_v1',
    {
      p_source_reference: sourceReference,
      p_service_key: input.serviceKey,
      p_rule_key: input.serviceKey,
      p_branch_id: input.branchId ?? null,
      p_spend_pence: input.spendPence ?? null,
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    },
  )
  if (campaignResult.error) throw loyaltyWriteError()
  return {
    sourceReference,
    activationMilestone: customerLoyaltyActivationMilestone(input.source.type),
    award: data,
    campaignAward: campaignResult.data,
  }
}

export async function recordCustomerServiceLoyaltyEvent(input: {
  namespace: string
  recordId: string
  eventReference: string
  eventType: 'completed' | 'paid' | 'cancelled' | 'refunded'
  occurredAt?: string
}) {
  // This also applies the transition synchronously. The database stores the
  // evidence event first, so retries with the same reference are idempotent.
  customerLoyaltySourceReference({
    type: 'service',
    namespace: input.namespace,
    recordId: input.recordId,
  })
  const eventReference = input.eventReference.trim()
  if (!eventReference || eventReference.length > 200) {
    throw new Error('A stable service event reference is required.')
  }
  const occurredAt = input.occurredAt || new Date().toISOString()
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error('A valid event time is required.')

  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_record_service_event_v1',
    {
      p_source_namespace: input.namespace.trim().toLowerCase(),
      p_source_record_id: input.recordId,
      p_event_reference: eventReference,
      p_event_type: input.eventType,
      p_occurred_at: occurredAt,
    },
  )
  if (error) throw loyaltyWriteError()
  return data
}

export async function reconcileCustomerLoyaltySource(source: CustomerLoyaltySource) {
  customerLoyaltySourceReference(source)
  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_reconcile_source_v1',
    {
      p_source_type: source.type,
      p_source_namespace: source.namespace?.trim().toLowerCase() || null,
      p_source_record_id: source.recordId,
    },
  )
  if (error) throw loyaltyWriteError()
  return data
}
