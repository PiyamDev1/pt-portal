export const PACKAGE_AGENT_COMMISSION_METADATA_KEY = 'provisionalAgentCommissions'

export type PackageAgentCommissionRole =
  | 'ticketing_agent'
  | 'assisting_agent'
  | 'main_dealer'
  | 'other'

export type PackageAgentCommissionBasis = 'ticket_commission' | 'fixed_amount' | 'none'

export type PackageAgentCommissionAllocation = {
  id: string
  employeeId: string
  role: PackageAgentCommissionRole
  basis: PackageAgentCommissionBasis
  quantity: number
  unitAmount: number
  deductFromProfit: boolean
  note: string
}

const ROLES = new Set<PackageAgentCommissionRole>([
  'ticketing_agent',
  'assisting_agent',
  'main_dealer',
  'other',
])
const BASES = new Set<PackageAgentCommissionBasis>(['ticket_commission', 'fixed_amount', 'none'])

function cleanNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function normalizePackageAgentCommissionAllocations(
  value: unknown,
): PackageAgentCommissionAllocation[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, 20).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const employeeId = typeof row.employeeId === 'string' ? row.employeeId.trim() : ''
    if (!employeeId) return []
    const role = ROLES.has(row.role as PackageAgentCommissionRole)
      ? (row.role as PackageAgentCommissionRole)
      : 'other'
    const basis = BASES.has(row.basis as PackageAgentCommissionBasis)
      ? (row.basis as PackageAgentCommissionBasis)
      : 'none'
    const quantity =
      basis === 'ticket_commission' ? cleanNumber(row.quantity) : basis === 'none' ? 0 : 1
    const unitAmount = basis === 'none' ? 0 : cleanNumber(row.unitAmount)

    return [
      {
        id:
          typeof row.id === 'string' && row.id.trim()
            ? row.id.trim().slice(0, 100)
            : `allocation-${index + 1}`,
        employeeId,
        role,
        basis,
        quantity,
        unitAmount,
        deductFromProfit: basis !== 'none' && row.deductFromProfit !== false,
        note: typeof row.note === 'string' ? row.note.trim().slice(0, 500) : '',
      },
    ]
  })
}

export function getPackageAgentCommissionAmount(allocation: PackageAgentCommissionAllocation) {
  if (allocation.basis === 'none') return 0
  if (allocation.basis === 'fixed_amount') return allocation.unitAmount
  return allocation.quantity * allocation.unitAmount
}

export function getPackageAgentCommissionDeduction(
  allocations: PackageAgentCommissionAllocation[],
) {
  return allocations.reduce(
    (total, allocation) =>
      total + (allocation.deductFromProfit ? getPackageAgentCommissionAmount(allocation) : 0),
    0,
  )
}
