import type {
  TravelPackageDocument,
  TravelPackageFolder,
  TravelPackageFolderStatus,
  TravelPackageInvoice,
  TravelPackageInstallment,
  TravelPackagePayment,
  TravelPackageReservation,
  TravelPackageReservationType,
  TravelPackageTransportVoucher,
} from '@/app/types/packages'

export type PackageWorkflowRisk = {
  riskType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  dueAt?: string | null
}

export type PackagePaymentSummary = {
  completedPayments: number
  refunds: number
  netPaid: number
  pending: number
  overdue: number
  currency: string
}

const TERMINAL_PACKAGE_STATUSES = new Set<TravelPackageFolderStatus>([
  'closed',
  'cancelled',
  'archived',
])

const STATUS_TRANSITIONS: Record<TravelPackageFolderStatus, TravelPackageFolderStatus[]> = {
  selected: [
    'awaiting_passports',
    'awaiting_deposit',
    'reservation_pending',
    'cancelled',
    'archived',
  ],
  awaiting_passports: [
    'selected',
    'awaiting_deposit',
    'reservation_pending',
    'cancelled',
    'archived',
  ],
  awaiting_deposit: [
    'awaiting_passports',
    'reservation_pending',
    'partially_booked',
    'cancelled',
    'archived',
  ],
  reservation_pending: [
    'awaiting_deposit',
    'partially_booked',
    'fully_reserved',
    'cancelled',
    'archived',
  ],
  partially_booked: [
    'awaiting_deposit',
    'reservation_pending',
    'fully_reserved',
    'cancelled',
    'archived',
  ],
  fully_reserved: [
    'partially_booked',
    'documents_pending',
    'documents_released',
    'travelling_soon',
    'cancelled',
  ],
  documents_pending: [
    'partially_booked',
    'fully_reserved',
    'documents_released',
    'travelling_soon',
    'cancelled',
  ],
  documents_released: ['documents_pending', 'travelling_soon', 'travelling', 'cancelled'],
  travelling_soon: ['documents_pending', 'documents_released', 'travelling', 'cancelled'],
  travelling: ['returned', 'cancelled'],
  returned: ['travelling', 'closed', 'cancelled'],
  closed: ['returned', 'archived'],
  cancelled: ['archived'],
  archived: [],
}

const RESERVATION_LABELS: Record<TravelPackageReservationType, string> = {
  flight: 'flight',
  hotel: 'hotel',
  visa: 'visa',
  transport: 'transport',
  other: 'service',
}

function money(value: unknown) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function daysUntil(value: string | null | undefined, now: number) {
  const target = timestamp(value)
  if (target === null) return null
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000))
}

export function canTransitionTravelPackageStatus(
  from: TravelPackageFolderStatus,
  to: TravelPackageFolderStatus,
) {
  return from === to || STATUS_TRANSITIONS[from]?.includes(to) === true
}

export function getTravelPackageStatusTransitions(status: TravelPackageFolderStatus) {
  return STATUS_TRANSITIONS[status] || []
}

export function calculatePackagePaymentSummary(
  payments: TravelPackagePayment[],
  now = Date.now(),
): PackagePaymentSummary {
  const completedPayments = money(
    payments
      .filter(
        (payment) =>
          payment.payment_status === 'completed' &&
          ['deposit', 'payment'].includes(payment.payment_type),
      )
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  )
  const refunds = money(
    payments
      .filter(
        (payment) =>
          payment.payment_status === 'completed' &&
          ['refund', 'chargeback'].includes(payment.payment_type),
      )
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  )
  const pending = money(
    payments
      .filter((payment) => payment.payment_status === 'pending')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  )
  const overdue = money(
    payments
      .filter((payment) => {
        const due = timestamp(payment.due_at)
        return payment.payment_status === 'pending' && due !== null && due < now
      })
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  )

  return {
    completedPayments,
    refunds,
    netPaid: money(completedPayments - refunds),
    pending,
    overdue,
    currency: payments.find((payment) => payment.currency)?.currency || 'GBP',
  }
}

export function derivePackagePaymentStatus(
  paymentSummary: PackagePaymentSummary,
  invoice: TravelPackageInvoice | null,
) {
  if (paymentSummary.refunds > 0 && paymentSummary.netPaid <= 0) return 'refunded'
  if (paymentSummary.overdue > 0) return 'overdue'
  if (invoice && invoice.total_sold > 0 && paymentSummary.netPaid >= invoice.total_sold)
    return 'paid'
  if (paymentSummary.netPaid > 0) return 'partial'
  if (paymentSummary.pending > 0) return 'deposit_requested'
  return 'not_requested'
}

function getExpectedReservationTypes(packageFolder: TravelPackageFolder) {
  const payload = packageFolder.selected_quote_snapshot?.payload
  const expected = new Set<TravelPackageReservationType>(['hotel'])
  if (payload?.flightOptions?.length) expected.add('flight')
  if (payload?.visaOptions?.length) expected.add('visa')
  if (payload?.transportOptions?.length) expected.add('transport')
  return [...expected]
}

function hasConfirmedReservation(
  reservations: TravelPackageReservation[],
  type: TravelPackageReservationType,
) {
  return reservations.some(
    (reservation) =>
      reservation.reservation_type === type &&
      ['reserved', 'paid', 'confirmed'].includes(reservation.status),
  )
}

export function derivePackageWorkflow(input: {
  packageFolder: TravelPackageFolder
  reservations?: TravelPackageReservation[]
  documents?: TravelPackageDocument[]
  invoice?: TravelPackageInvoice | null
  payments?: TravelPackagePayment[]
  vouchers?: TravelPackageTransportVoucher[]
  installments?: TravelPackageInstallment[]
  now?: number
}) {
  const {
    packageFolder,
    reservations = [],
    documents = [],
    invoice = null,
    payments = [],
    vouchers = [],
    installments = [],
    now = Date.now(),
  } = input
  const risks: PackageWorkflowRisk[] = []
  const paymentSummary = calculatePackagePaymentSummary(payments, now)
  const paymentStatus = derivePackagePaymentStatus(paymentSummary, invoice)
  const departureDays = daysUntil(packageFolder.departure_date, now)
  const returnDays = daysUntil(packageFolder.return_date, now)
  const expectedTypes = getExpectedReservationTypes(packageFolder)
  const missingReservationType = expectedTypes.find(
    (type) => !hasConfirmedReservation(reservations, type),
  )
  const releasedDocuments = documents.filter(
    (document) => document.customer_visible && document.status === 'released',
  )
  const transportRequired = expectedTypes.includes('transport')
  const transportVoucherReleased = vouchers.some(
    (voucher) => voucher.customer_visible && voucher.status === 'released_to_customer',
  )
  const overdueInstallments = installments.filter((installment) => {
    const due = timestamp(installment.due_on)
    return (
      installment.status === 'overdue' ||
      (['scheduled', 'due'].includes(installment.status) && due !== null && due < now)
    )
  })

  if (departureDays !== null && departureDays <= 14 && departureDays >= 0) {
    if (expectedTypes.includes('visa') && !hasConfirmedReservation(reservations, 'visa')) {
      risks.push({
        riskType: 'visa_deadline',
        severity: departureDays <= 7 ? 'critical' : 'high',
        title: 'Visa not complete',
        description: `Departure is in ${departureDays} day${departureDays === 1 ? '' : 's'} and the visa is not confirmed.`,
        dueAt: packageFolder.departure_date,
      })
    }
  }

  if (
    departureDays !== null &&
    departureDays <= 7 &&
    departureDays >= 0 &&
    releasedDocuments.length === 0
  ) {
    risks.push({
      riskType: 'documents_not_released',
      severity: departureDays <= 3 ? 'critical' : 'high',
      title: 'Customer documents not released',
      description: `Departure is in ${departureDays} day${departureDays === 1 ? '' : 's'} and no documents are live.`,
      dueAt: packageFolder.departure_date,
    })
  }

  if (paymentSummary.overdue > 0) {
    risks.push({
      riskType: 'customer_payment_overdue',
      severity: 'high',
      title: 'Customer payment overdue',
      description: `${paymentSummary.currency} ${paymentSummary.overdue.toFixed(2)} is overdue.`,
    })
  }

  if (overdueInstallments.length > 0) {
    risks.push({
      riskType: 'installment_overdue',
      severity: 'high',
      title: 'Installment payment overdue',
      description: `${overdueInstallments.length} installment${overdueInstallments.length === 1 ? '' : 's'} need follow-up.`,
      dueAt: overdueInstallments.sort((left, right) => left.due_on.localeCompare(right.due_on))[0]
        ?.due_on,
    })
  }

  if (invoice && invoice.projected_margin < 0) {
    risks.push({
      riskType: 'negative_margin',
      severity: 'critical',
      title: 'Negative projected margin',
      description: 'The current sold price is below booked cost after commission.',
    })
  }

  if (
    transportRequired &&
    departureDays !== null &&
    departureDays <= 7 &&
    !transportVoucherReleased
  ) {
    risks.push({
      riskType: 'transport_voucher_missing',
      severity: departureDays <= 3 ? 'critical' : 'high',
      title: 'Transport voucher not released',
      description: 'Transport is included but the customer voucher is not live.',
      dueAt: packageFolder.departure_date,
    })
  }

  if (packageFolder.status === 'returned' && returnDays !== null && returnDays < 0) {
    risks.push({
      riskType: 'returned_not_closed',
      severity: Math.abs(returnDays) > 14 ? 'high' : 'medium',
      title: 'Returned package needs closing',
      description:
        'Complete supplier, refund, and commission checks before marking the package earned.',
    })
  }

  let nextAction = 'Review package'
  let nextActionDueAt: string | null = null

  if (TERMINAL_PACKAGE_STATUSES.has(packageFolder.status)) {
    nextAction =
      packageFolder.status === 'closed' ? 'Package complete and earned' : 'No action required'
  } else if (packageFolder.status === 'returned') {
    nextAction = 'Reconcile costs and close package'
  } else if (packageFolder.passport_status !== 'ready') {
    nextAction =
      packageFolder.passport_status === 'issues_found'
        ? 'Resolve passport copy issues'
        : 'Request and check passport copies'
  } else if (paymentStatus === 'overdue') {
    nextAction = 'Follow up overdue payment'
  } else if (overdueInstallments.length > 0) {
    nextAction = 'Follow up overdue installment'
  } else if (paymentStatus === 'not_requested' && reservations.length === 0) {
    nextAction = 'Request customer deposit'
  } else if (missingReservationType) {
    nextAction = `Reserve ${RESERVATION_LABELS[missingReservationType]}`
  } else if (transportRequired && vouchers.length === 0) {
    nextAction = 'Create transport voucher'
  } else if (releasedDocuments.length === 0) {
    nextAction = 'Prepare and release customer documents'
  } else if (!invoice) {
    nextAction = 'Create internal invoice'
  } else if (!invoice.released_to_customer) {
    nextAction = 'Review and release customer invoice'
  } else if (
    departureDays !== null &&
    departureDays <= 0 &&
    returnDays !== null &&
    returnDays >= 0
  ) {
    nextAction = 'Mark customer as travelling'
  } else if (returnDays !== null && returnDays < 0) {
    nextAction = 'Confirm customer returned safely'
  } else {
    nextAction = 'Monitor upcoming travel'
    nextActionDueAt = packageFolder.departure_date
  }

  if (!nextActionDueAt) {
    const urgentRisk = [...risks].sort(
      (left, right) =>
        ['low', 'medium', 'high', 'critical'].indexOf(right.severity) -
        ['low', 'medium', 'high', 'critical'].indexOf(left.severity),
    )[0]
    nextActionDueAt = urgentRisk?.dueAt || null
  }

  const riskLevel = risks.reduce<TravelPackageFolder['risk_level']>((highest, risk) => {
    const levels: TravelPackageFolder['risk_level'][] = [
      'none',
      'low',
      'medium',
      'high',
      'critical',
    ]
    return levels.indexOf(risk.severity) > levels.indexOf(highest) ? risk.severity : highest
  }, 'none')

  return {
    nextAction,
    nextActionDueAt,
    riskLevel,
    risks,
    paymentSummary,
    paymentStatus,
  }
}

export function getLifecycleTimestampUpdate(
  status: TravelPackageFolderStatus,
  now = new Date().toISOString(),
) {
  if (status === 'travelling') return { travelled_at: now }
  if (status === 'returned') return { returned_at: now }
  if (status === 'closed') return { closed_at: now, earned_at: now }
  if (status === 'archived') return { archived_at: now }
  return {}
}
