export const PACKAGE_FINANCIAL_SUMMARY_VERSION = 1 as const

export type PackageFinancialDateBasis = 'reservation_created_at' | 'invoice_created_at'

export type PackageFinancialSummaryInput = {
  soldAmount?: unknown
  bookedCost?: unknown
  discountAmount?: unknown
  customerRefundAmount?: unknown
  supplierRefundAmount?: unknown
  expectedCommissionAmount?: unknown
  receivedCommissionAmount?: unknown
  paidAmount?: unknown
}

export type PackageFinancialSummary = {
  version: typeof PACKAGE_FINANCIAL_SUMMARY_VERSION
  dateBasis: PackageFinancialDateBasis
  soldAmount: number
  bookedCost: number
  discountAmount: number
  customerRefundAmount: number
  supplierRefundAmount: number
  expectedCommissionAmount: number
  receivedCommissionAmount: number
  paidAmount: number
  netSoldAmount: number
  netBookedCost: number
  balanceAmount: number
  projectedMargin: number
}

export function roundPackageFinancialMoney(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.round((parsed + Number.EPSILON) * 100) / 100
}

export function createPackageFinancialSummary(
  input: PackageFinancialSummaryInput,
  dateBasis: PackageFinancialDateBasis,
): PackageFinancialSummary {
  const soldAmount = roundPackageFinancialMoney(input.soldAmount)
  const bookedCost = roundPackageFinancialMoney(input.bookedCost)
  const discountAmount = roundPackageFinancialMoney(input.discountAmount)
  const customerRefundAmount = roundPackageFinancialMoney(input.customerRefundAmount)
  const supplierRefundAmount = roundPackageFinancialMoney(input.supplierRefundAmount)
  const expectedCommissionAmount = roundPackageFinancialMoney(input.expectedCommissionAmount)
  const receivedCommissionAmount = roundPackageFinancialMoney(input.receivedCommissionAmount)
  const paidAmount = roundPackageFinancialMoney(input.paidAmount)
  const netSoldAmount = roundPackageFinancialMoney(
    soldAmount - discountAmount - customerRefundAmount,
  )
  const netBookedCost = roundPackageFinancialMoney(bookedCost - supplierRefundAmount)

  return {
    version: PACKAGE_FINANCIAL_SUMMARY_VERSION,
    dateBasis,
    soldAmount,
    bookedCost,
    discountAmount,
    customerRefundAmount,
    supplierRefundAmount,
    expectedCommissionAmount,
    receivedCommissionAmount,
    paidAmount,
    netSoldAmount,
    netBookedCost,
    balanceAmount: roundPackageFinancialMoney(netSoldAmount - paidAmount),
    projectedMargin: roundPackageFinancialMoney(
      netSoldAmount - netBookedCost + expectedCommissionAmount,
    ),
  }
}
