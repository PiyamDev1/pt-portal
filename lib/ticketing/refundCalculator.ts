export const TICKET_CANCELLATION_FORMULA_VERSION = '2026-08-29.1'
export const TICKET_REPLACEMENT_FORMULA_VERSION = '2026-08-29.1'

export type TicketCancellationInput = {
  ticketSalePricePence: number
  supplierTicketCostPence: number
  airlineCancellationFeePence: number
  supplierCancellationChargePence: number
  retainedAgentCommissionPence: number
  desiredCompanyMarkupPence: number
}

export type TicketCancellationResult = {
  formulaVersion: string
  originalCompanyMarginPence: number
  minimumCancellationChargePence: number
  totalCancellationChargePence: number
  customerRefundPence: number
  customerRefundShortfallPence: number
  expectedAirlineRecoveryPence: number
  expectedCompanyResultPence: number
  requiresManagerReview: boolean
}

export type TicketReplacementAdjustmentInput = {
  cancellationCreditPence: number
  replacementSupplierCostPence: number
  replacementRecordedSalePricePence: number
  replacementAgentCommissionPence: number
  desiredReplacementMarkupPence: number
}

export type TicketReplacementAdjustmentResult = {
  formulaVersion: string
  minimumNetZeroReplacementSalePence: number
  minimumSafeReplacementSalePence: number
  minimumAdditionalCustomerPaymentPence: number
  customerCreditRemainingAtSafePricePence: number
  recordedCancellationCreditAppliedPence: number
  recordedAdditionalCustomerPaymentPence: number
  recordedCustomerCreditRemainingPence: number
  recordedReplacementResultPence: number
  companyLossAtRecordedSalePence: number
  desiredCompanyResultShortfallPence: number
  requiresManagerReview: boolean
}

function assertPence(value: number, field: keyof TicketCancellationInput) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer number of pence`)
  }
}

export function parseGbpToPence(value: string): number | null {
  const normalized = value.trim()
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) return null

  const [whole = '0', fraction = ''] = normalized.split('.')
  const pence = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(pence) ? pence : null
}

export function formatGbpFromPence(value: number) {
  const sign = value < 0 ? '-' : ''
  return `${sign}£${(Math.abs(value) / 100).toFixed(2)}`
}

export function calculateTicketCancellation(
  input: TicketCancellationInput,
): TicketCancellationResult {
  for (const [field, value] of Object.entries(input) as Array<
    [keyof TicketCancellationInput, number]
  >) {
    assertPence(value, field)
  }

  const minimumCancellationChargePence =
    input.airlineCancellationFeePence +
    input.supplierCancellationChargePence +
    input.retainedAgentCommissionPence
  const totalCancellationChargePence =
    minimumCancellationChargePence + input.desiredCompanyMarkupPence
  const rawCustomerRefundPence = input.ticketSalePricePence - totalCancellationChargePence
  const customerRefundShortfallPence = Math.max(-rawCustomerRefundPence, 0)

  return {
    formulaVersion: TICKET_CANCELLATION_FORMULA_VERSION,
    originalCompanyMarginPence:
      input.ticketSalePricePence -
      input.supplierTicketCostPence -
      input.retainedAgentCommissionPence,
    minimumCancellationChargePence,
    totalCancellationChargePence,
    customerRefundPence: Math.max(rawCustomerRefundPence, 0),
    customerRefundShortfallPence,
    expectedAirlineRecoveryPence: input.supplierTicketCostPence - input.airlineCancellationFeePence,
    expectedCompanyResultPence: input.desiredCompanyMarkupPence,
    requiresManagerReview: customerRefundShortfallPence > 0,
  }
}

export function calculateTicketReplacementAdjustment(
  input: TicketReplacementAdjustmentInput,
): TicketReplacementAdjustmentResult {
  for (const [field, value] of Object.entries(input) as Array<
    [keyof TicketReplacementAdjustmentInput, number]
  >) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a non-negative integer number of pence`)
    }
  }

  const minimumNetZeroReplacementSalePence =
    input.replacementSupplierCostPence + input.replacementAgentCommissionPence
  const minimumSafeReplacementSalePence =
    minimumNetZeroReplacementSalePence + input.desiredReplacementMarkupPence
  const recordedReplacementResultPence =
    input.replacementRecordedSalePricePence - minimumNetZeroReplacementSalePence
  const desiredCompanyResultShortfallPence = Math.max(
    minimumSafeReplacementSalePence - input.replacementRecordedSalePricePence,
    0,
  )

  return {
    formulaVersion: TICKET_REPLACEMENT_FORMULA_VERSION,
    minimumNetZeroReplacementSalePence,
    minimumSafeReplacementSalePence,
    minimumAdditionalCustomerPaymentPence: Math.max(
      minimumSafeReplacementSalePence - input.cancellationCreditPence,
      0,
    ),
    customerCreditRemainingAtSafePricePence: Math.max(
      input.cancellationCreditPence - minimumSafeReplacementSalePence,
      0,
    ),
    recordedCancellationCreditAppliedPence: Math.min(
      input.cancellationCreditPence,
      input.replacementRecordedSalePricePence,
    ),
    recordedAdditionalCustomerPaymentPence: Math.max(
      input.replacementRecordedSalePricePence - input.cancellationCreditPence,
      0,
    ),
    recordedCustomerCreditRemainingPence: Math.max(
      input.cancellationCreditPence - input.replacementRecordedSalePricePence,
      0,
    ),
    recordedReplacementResultPence,
    companyLossAtRecordedSalePence: Math.max(-recordedReplacementResultPence, 0),
    desiredCompanyResultShortfallPence,
    requiresManagerReview: desiredCompanyResultShortfallPence > 0,
  }
}
