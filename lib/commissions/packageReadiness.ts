export type PackageCommissionReadinessState =
  | 'ready_to_close'
  | 'needs_attention'
  | 'awaiting_processing'
  | 'processing'
  | 'processed'
  | 'held'
  | 'rejected'

export type PackageCommissionReadiness = {
  stage: 'pre_close' | 'closed'
  state: PackageCommissionReadinessState
  handoffReady: boolean
  authoritative: boolean
  issues: string[]
  passengerCount: number
  reservationCount: number
  calculationRowCount: number
  invoiceReferenceRowCount: number
  eventVersion: number | null
  eventStatus: string | null
  eventError: string | null
  eventUpdatedAt: string | null
  snapshotCurrent: boolean
}

export const PACKAGE_COMMISSION_ISSUE_LABELS: Record<string, string> = {
  package_not_closed: 'After return, double-check the folder and mark it Complete - Checked.',
  missing_earned_date: 'The package is missing its earned or closed date.',
  missing_sales_employee: 'Assign the responsible sales employee.',
  missing_package_location: 'Assign the package to a branch.',
  missing_reservations: 'Add the package reservations.',
  unfinished_reservations: 'Complete or cancel every reservation.',
  missing_passengers: 'Add at least one passenger.',
  invalid_shared_transport_structure:
    'Keep exactly one physical Group main transport for the family reference rows.',
  missing_active_invoice: 'Create an active package invoice.',
  invoice_not_settled: 'Settle the outstanding invoice balance. Customer release is not required.',
  supplier_commission_not_reconciled:
    'Reconcile received supplier commission between reservations and the invoice.',
  invoice_sales_not_reconciled: 'Reconcile invoice sales with the reservation totals.',
  invoice_cost_not_reconciled: 'Reconcile invoice booked cost with the reservation totals.',
  package_payment_not_paid: 'Mark the package payment status as paid.',
  pending_package_payments: 'Resolve every pending package payment.',
  non_gbp_package_source: 'Convert the package source records to GBP before Commission handoff.',
}

export const PACKAGE_COMMISSION_EVENT_ERROR_LABELS: Record<string, string> = {
  needs_policy: 'Commission Admin needs to assign an effective commission plan.',
  package_source_not_authoritative: 'The closed package still has unresolved source issues.',
  missing_required_variable: 'Commission Admin needs to review a missing calculation input.',
  calculation_failed: 'Commission Admin needs to review the shadow calculation.',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numberOrZero(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

const READINESS_STATES = new Set<PackageCommissionReadinessState>([
  'ready_to_close',
  'needs_attention',
  'awaiting_processing',
  'processing',
  'processed',
  'held',
  'rejected',
])

export function parsePackageCommissionReadiness(value: unknown): PackageCommissionReadiness | null {
  if (!isObject(value)) return null
  const state = value.state
  const stage = value.stage
  if (
    typeof state !== 'string' ||
    !READINESS_STATES.has(state as PackageCommissionReadinessState) ||
    (stage !== 'pre_close' && stage !== 'closed') ||
    !Array.isArray(value.issues)
  ) {
    return null
  }

  return {
    stage,
    state: state as PackageCommissionReadinessState,
    handoffReady: value.handoffReady === true,
    authoritative: value.authoritative === true,
    issues: value.issues.filter((issue): issue is string => typeof issue === 'string'),
    passengerCount: numberOrZero(value.passengerCount),
    reservationCount: numberOrZero(value.reservationCount),
    calculationRowCount: numberOrZero(value.calculationRowCount),
    invoiceReferenceRowCount: numberOrZero(value.invoiceReferenceRowCount),
    eventVersion: value.eventVersion === null ? null : numberOrZero(value.eventVersion),
    eventStatus: nullableString(value.eventStatus),
    eventError: nullableString(value.eventError),
    eventUpdatedAt: nullableString(value.eventUpdatedAt),
    snapshotCurrent: value.snapshotCurrent === true,
  }
}

export function getPackageCommissionIssueLabel(issue: string) {
  return PACKAGE_COMMISSION_ISSUE_LABELS[issue] || 'Review this package source issue.'
}

export function getPackageCommissionEventErrorLabel(error: string | null) {
  if (!error) return null
  return (
    PACKAGE_COMMISSION_EVENT_ERROR_LABELS[error] ||
    'Commission Admin needs to review this shadow calculation.'
  )
}
