import type { PosReconciliationStatus, PosTenderDestination } from '@/lib/pos/contracts'

export type PosReconciliationEventSnapshot = {
  status: PosReconciliationStatus
  external_reference?: string | null
  created_at: string
  id: number
}

export type PosReconciliationTenderSnapshot = {
  reconciliation_status: PosReconciliationStatus
  external_reference?: string | null
  pos_reconciliation_events?: PosReconciliationEventSnapshot[] | null
}

export function resolvePosTenderReconciliation(tender: PosReconciliationTenderSnapshot) {
  const latest = [...(tender.pos_reconciliation_events || [])].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) || Number(right.id) - Number(left.id),
  )[0]

  return {
    status: latest?.status || tender.reconciliation_status,
    externalReference: latest?.external_reference || tender.external_reference || null,
  }
}

export function isPosReconciliationComplete(status: string) {
  return status === 'COMPLETED' || status === 'CLEARED'
}

export function isPosTenderUnreconciled(tender: {
  reconciliationStatus: string
  destination?: PosTenderDestination
}) {
  return (
    tender.destination !== 'SUPPLIER_DIRECT' &&
    !isPosReconciliationComplete(tender.reconciliationStatus)
  )
}
