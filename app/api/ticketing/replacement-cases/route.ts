import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  ticketingCreateReplacementCaseSchema,
  TICKET_REPLACEMENT_CASE_CAPABILITY_VERSION,
  type TicketingReplacementCase,
} from '@/lib/ticketing/replacementCaseContracts'
import { canManageTicketingRecords, requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type Related<T> = T | T[] | null
type EmployeeRow = { id: string; full_name: string | null }
type ItemRow = {
  id: string
  booking_id: string
  transaction_id: string
  pnr: string
  supplier_cost_gbp: string | number
  sale_price_gbp: string | number
  position: number
  owner: Related<EmployeeRow>
}
type ChangeRow = {
  id: string
  replaced_item_id: string
  new_booking_id: string
  new_transaction_id: string
  new_pnr: string
  supplier_refund_gbp: string | number
  supplier_admin_fee_gbp: string | number
  new_supplier_cost_gbp: string | number
  customer_charge_gbp: string | number
  incremental_result_gbp: string | number
  notes: string | null
  created_at: string
  servicing_employee: Related<EmployeeRow>
}
type CaseRow = {
  id: string
  version: string | number
  status: 'recorded' | 'closed' | 'voided'
  reason: TicketingReplacementCase['reason']
  recovery_policy: TicketingReplacementCase['recoveryPolicy']
  original_booking_id: string
  original_transaction_id: string
  original_sale_gbp: string | number
  original_supplier_cost_gbp: string | number
  replacement_supplier_cost_gbp: string | number
  supplier_cost_increase_gbp: string | number
  company_margin_absorbed_gbp: string | number
  employee_recovery_gbp: string | number
  original_commission_treatment: 'reverse'
  replacement_commission_treatment: 'standard'
  notes: string | null
  created_at: string
  original_booking: Related<{ pnr: string }>
  responsible_employee: Related<EmployeeRow>
  created_by: Related<EmployeeRow>
  ticket_replacement_case_items: ItemRow[] | null
  ticket_replacement_case_changes: ChangeRow[] | null
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function employee(value: Related<EmployeeRow>) {
  const row = first(value)
  return row?.id && row.full_name?.trim() ? { id: row.id, fullName: row.full_name.trim() } : null
}

function money(value: string | number) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function replacementCase(row: CaseRow): TicketingReplacementCase | null {
  const originalBooking = first(row.original_booking)
  const responsibleEmployee = employee(row.responsible_employee)
  const createdBy = employee(row.created_by)
  const amounts = [
    row.original_sale_gbp,
    row.original_supplier_cost_gbp,
    row.replacement_supplier_cost_gbp,
    row.supplier_cost_increase_gbp,
    row.company_margin_absorbed_gbp,
    row.employee_recovery_gbp,
  ].map(money)
  if (
    !originalBooking?.pnr ||
    !responsibleEmployee ||
    !createdBy ||
    amounts.some((v) => v === null)
  ) {
    return null
  }
  const items = (row.ticket_replacement_case_items || [])
    .map((item) => {
      const owner = employee(item.owner)
      const supplierCostGbp = money(item.supplier_cost_gbp)
      const salePriceGbp = money(item.sale_price_gbp)
      return owner && supplierCostGbp !== null && salePriceGbp !== null
        ? {
            id: item.id,
            bookingId: item.booking_id,
            transactionId: item.transaction_id,
            pnr: item.pnr,
            supplierCostGbp,
            salePriceGbp,
            owner,
            position: Number(item.position),
          }
        : null
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.position - right.position)
  const changes = (row.ticket_replacement_case_changes || [])
    .map((change) => {
      const servicingEmployee = employee(change.servicing_employee)
      const changeAmounts = [
        change.supplier_refund_gbp,
        change.supplier_admin_fee_gbp,
        change.new_supplier_cost_gbp,
        change.customer_charge_gbp,
        change.incremental_result_gbp,
      ].map(money)
      return servicingEmployee && changeAmounts.every((value) => value !== null)
        ? {
            id: change.id,
            replacedItemId: change.replaced_item_id,
            newBookingId: change.new_booking_id,
            newTransactionId: change.new_transaction_id,
            newPnr: change.new_pnr,
            supplierRefundGbp: changeAmounts[0]!,
            supplierAdminFeeGbp: changeAmounts[1]!,
            newSupplierCostGbp: changeAmounts[2]!,
            customerChargeGbp: changeAmounts[3]!,
            incrementalResultGbp: changeAmounts[4]!,
            servicingEmployee,
            notes: change.notes,
            createdAt: change.created_at,
          }
        : null
    })
    .filter((change): change is NonNullable<typeof change> => Boolean(change))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  return {
    id: row.id,
    version: Number(row.version),
    status: row.status,
    reason: row.reason,
    recoveryPolicy: row.recovery_policy,
    original: {
      bookingId: row.original_booking_id,
      transactionId: row.original_transaction_id,
      pnr: originalBooking.pnr,
      salePriceGbp: amounts[0]!,
      supplierCostGbp: amounts[1]!,
    },
    responsibleEmployee,
    createdBy,
    replacementSupplierCostGbp: amounts[2]!,
    supplierCostIncreaseGbp: amounts[3]!,
    companyMarginAbsorbedGbp: amounts[4]!,
    employeeRecoveryGbp: amounts[5]!,
    originalCommissionTreatment: row.original_commission_treatment,
    replacementCommissionTreatment: row.replacement_commission_treatment,
    notes: row.notes,
    items,
    changes,
    createdAt: row.created_at,
  }
}

async function capabilityReady(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  return !error && hasTicketingSchemaCapability(data, TICKET_REPLACEMENT_CASE_CAPABILITY_VERSION)
}

export async function GET() {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const supabase = getServiceSupabaseClient()
  if (!(await capabilityReady(supabase))) {
    return apiError('Replacement Cases is not installed on this database.', 503)
  }
  const canManageTeam = canManageTicketingRecords(access.employee.role)
  let casesQuery = supabase.from('ticket_replacement_cases').select(`
    id, version, status, reason, recovery_policy,
    original_booking_id, original_transaction_id,
    original_sale_gbp, original_supplier_cost_gbp, replacement_supplier_cost_gbp,
    supplier_cost_increase_gbp, company_margin_absorbed_gbp, employee_recovery_gbp,
    original_commission_treatment, replacement_commission_treatment, notes, created_at,
    original_booking:ticket_bookings!ticket_replacement_cases_original_booking_id_fkey(pnr),
    responsible_employee:employees!ticket_replacement_cases_responsible_employee_id_fkey(id, full_name),
    created_by:employees!ticket_replacement_cases_created_by_employee_id_fkey(id, full_name),
    ticket_replacement_case_items(
      id, booking_id, transaction_id, pnr, supplier_cost_gbp, sale_price_gbp, position,
      owner:employees!ticket_replacement_case_items_owner_employee_id_fkey(id, full_name)
    ),
    ticket_replacement_case_changes(
      id, replaced_item_id, new_booking_id, new_transaction_id, new_pnr,
      supplier_refund_gbp, supplier_admin_fee_gbp, new_supplier_cost_gbp,
      customer_charge_gbp, incremental_result_gbp, notes, created_at,
      servicing_employee:employees!ticket_replacement_case_changes_servicing_employee_id_fkey(id, full_name)
    )
  `)
  if (!canManageTeam) {
    casesQuery = casesQuery.or(
      `created_by_employee_id.eq.${access.employee.id},responsible_employee_id.eq.${access.employee.id}`,
    )
  }
  const [casesResult, employeesResult] = await Promise.all([
    casesQuery.order('created_at', { ascending: false }).limit(100),
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
  ])
  if (casesResult.error || employeesResult.error) {
    return apiError('Unable to load replacement cases right now.', 500)
  }
  const items = ((casesResult.data || []) as unknown as CaseRow[])
    .map(replacementCase)
    .filter((item): item is TicketingReplacementCase => Boolean(item))
  const employees = ((employeesResult.data || []) as EmployeeRow[])
    .map((row) => employee(row))
    .filter((item): item is { id: string; fullName: string } => Boolean(item))
  return apiOk(
    {
      items,
      context: { employeeId: access.employee.id, canManageTeam, employees },
    },
    PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.replacement-case',
    limit: 40,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key || key.length > 200) return apiError('A valid save key is required.', 400)
  const { data: input, error } = await parseBodyWithSchema(
    request,
    ticketingCreateReplacementCaseSchema,
    { maxBytes: 24 * 1024 },
  )
  if (!input || error) return apiError(error || 'Review the replacement-case details.', 400)
  const supabase = getServiceSupabaseClient()
  if (!(await capabilityReady(supabase))) {
    return apiError('Replacement Cases is not installed on this database.', 503)
  }
  const result = await supabase.rpc('ticketing_create_replacement_case_2026092601', {
    p_actor_employee_id: access.employee.id,
    p_idempotency_key: key,
    p_entry: input,
  })
  if (result.error) {
    const hint = String(result.error.hint || '')
    if (hint === 'TICKETING_REPLACEMENT_VERSION_CONFLICT') {
      return apiError('The original ticket changed. Refresh it and try again.', 409)
    }
    if (hint === 'TICKETING_IDEMPOTENCY_CONFLICT') {
      return apiError('This save key was already used for different case details.', 409)
    }
    if (hint === 'TICKETING_REPLACEMENT_ALREADY_LINKED' || result.error.code === '23505') {
      return apiError('This original or replacement ticket is already linked to a case.', 409)
    }
    if (result.error.code === '42501') return apiError(result.error.message || 'Forbidden', 403)
    if (['22023', 'P0002'].includes(String(result.error.code || ''))) {
      return apiError(result.error.message || 'Review the replacement-case details.', 400)
    }
    return apiError('Unable to save the replacement case right now.', 500)
  }
  return apiOk(result.data, {
    status: result.data?.idempotentReplay ? 200 : 201,
    ...PRIVATE_RESPONSE,
  })
}
