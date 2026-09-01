export type CustomerLoyaltySourceType = 'ticket' | 'service' | 'package'
export type CustomerLoyaltyAwardState = 'pending' | 'available' | 'reversed'
export type CustomerLoyaltyTransition = 'none' | 'activate' | 'reverse'

export type CustomerLoyaltySource = {
  type: CustomerLoyaltySourceType
  recordId: string
  namespace?: string | null
}

export type CustomerLoyaltyEligibilitySnapshot =
  | {
      type: 'ticket'
      operationalStatus: string
      paymentStatus: string
    }
  | {
      type: 'service'
      completed: boolean
      paid: boolean
      cancelled: boolean
      refunded: boolean
    }
  | {
      type: 'package'
      status: string
      paymentStatus: string
    }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERVICE_NAMESPACE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const CUSTOMER_CODE_PATTERN =
  /^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$/

function normalizedRecordId(recordId: string) {
  const normalized = recordId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalized)) throw new Error('A valid source record ID is required.')
  return normalized
}

export function customerLoyaltySourceReference(source: CustomerLoyaltySource) {
  const recordId = normalizedRecordId(source.recordId)
  if (source.type === 'service') {
    const namespace = source.namespace?.trim().toLowerCase() || ''
    if (!SERVICE_NAMESPACE_PATTERN.test(namespace)) {
      throw new Error('A valid service namespace is required.')
    }
    return `service.v1:${namespace}:${recordId}`
  }
  if (source.namespace) throw new Error('Only service sources can have a namespace.')
  return `${source.type}.v1:${recordId}`
}

export function normalizeCustomerLoyaltyCode(customerCode: string) {
  const normalized = customerCode.trim().toUpperCase()
  if (!CUSTOMER_CODE_PATTERN.test(normalized)) throw new Error('A valid customer code is required.')
  return normalized
}

export function customerLoyaltyActivationMilestone(sourceType: CustomerLoyaltySourceType) {
  if (sourceType === 'ticket') return 'issued_and_paid'
  if (sourceType === 'service') return 'completed_and_paid'
  return 'fully_paid'
}

function eligibility(snapshot: CustomerLoyaltyEligibilitySnapshot) {
  if (snapshot.type === 'ticket') {
    return {
      eligible: snapshot.operationalStatus === 'issued' && snapshot.paymentStatus === 'paid',
      terminal:
        snapshot.operationalStatus === 'cancelled' ||
        snapshot.operationalStatus === 'part_refunded' ||
        snapshot.operationalStatus === 'refunded',
    }
  }
  if (snapshot.type === 'service') {
    return {
      eligible: snapshot.completed && snapshot.paid && !snapshot.cancelled && !snapshot.refunded,
      terminal: snapshot.cancelled || snapshot.refunded,
    }
  }
  return {
    eligible:
      snapshot.paymentStatus === 'paid' &&
      snapshot.status !== 'cancelled' &&
      snapshot.status !== 'archived',
    terminal: snapshot.status === 'cancelled' || snapshot.paymentStatus === 'refunded',
  }
}

/**
 * Mirrors the database state machine used by the source triggers. An available
 * award is reversed if its qualifying facts are later withdrawn, even when a
 * workflow records a correction rather than an explicit refund status.
 */
export function customerLoyaltyTransition(
  currentState: CustomerLoyaltyAwardState,
  snapshot: CustomerLoyaltyEligibilitySnapshot,
): CustomerLoyaltyTransition {
  if (currentState === 'reversed') return 'none'
  const current = eligibility(snapshot)
  if (current.terminal || (currentState === 'available' && !current.eligible)) return 'reverse'
  if (currentState === 'pending' && current.eligible) return 'activate'
  return 'none'
}
