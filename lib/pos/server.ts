import 'server-only'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import type { StaffSession } from '@/lib/auth/staffSession'
import { normalizeCustomerLoyaltyCode } from '@/lib/customerPortal/loyaltyLifecycle'
import { posPermissions } from '@/lib/pos/access'
import type {
  PosBalances,
  PosBootstrapPayload,
  PosCatalogueItem,
  PosCloseout,
  PosMutationResult,
  PosSupplierBalanceEntry,
  PosSupplierLedgerPayload,
  PosShift,
  PosSupplier,
  PosTill,
} from '@/lib/pos/contracts'
import {
  hasPosSchemaCapability,
  normalizePosSchemaStatus,
  POS_CAPABILITY_VERSION,
} from '@/lib/pos/schemaCapability'
import { posLogoUrl } from '@/lib/pos/logos'
import { suggestPosPricing } from '@/lib/pos/pricingMatcher'

type Related<T> = T | T[] | null

type PosEmployeeContext = {
  locationId: string
  branchName: string
  timezone: string
}

type SupabaseError = { code?: string; message?: string; hint?: string }

export class PosServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function loadPosEmployeeContext(employeeId: string): Promise<PosEmployeeContext> {
  const { data, error } = await getServiceSupabaseClient()
    .from('employees')
    .select('location_id, locations(id,name,timezone)')
    .eq('id', employeeId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  const row = data as unknown as {
    location_id: string | null
    locations: Related<{ id: string; name: string; timezone: string }>
  } | null
  const branch = first(row?.locations || null)
  if (!row?.location_id || !branch) {
    throw new PosServerError('Your employee profile is not assigned to a branch.', 403, 'NO_BRANCH')
  }
  return {
    locationId: branch.id,
    branchName: branch.name,
    timezone: branch.timezone || 'Europe/London',
  }
}

export async function getPosSchemaStatus() {
  const { data, error } = await getServiceSupabaseClient().rpc('pos_schema_status')
  if (error) return { ready: false, version: 0 }
  return normalizePosSchemaStatus(data) || { ready: false, version: 0 }
}

function mapCatalogue(row: Record<string, unknown>): PosCatalogueItem {
  return {
    id: String(row.id),
    key: String(row.item_key),
    groupKey: String(row.group_key),
    label: String(row.label),
    optionLabel: row.option_label ? String(row.option_label) : null,
    classification: row.classification as PosCatalogueItem['classification'],
    defaultDirection: row.default_direction as PosCatalogueItem['defaultDirection'],
    allowedDirections: (row.allowed_directions || []) as PosCatalogueItem['allowedDirections'],
    trackedSourceType: (row.tracked_source_type || null) as PosCatalogueItem['trackedSourceType'],
    sourceRequired: Boolean(row.source_required),
    customerRequired: Boolean(row.customer_required),
    loyaltyEligible: Boolean(row.loyalty_eligible),
    pointsPerGbp: numeric(row.points_per_gbp),
    allowedPaymentMethods: (row.allowed_payment_methods ||
      []) as PosCatalogueItem['allowedPaymentMethods'],
    noteRequired: Boolean(row.note_required),
    priceRequired: Boolean(row.price_required),
    shortcut: row.shortcut ? String(row.shortcut) : null,
    pricingOptions: [],
    categoryKey: String(row.group_key),
    logoKey: row.logo_key ? String(row.logo_key) : null,
    logoUrl: posLogoUrl(row.logo_key ? String(row.logo_key) : null, 'service'),
  }
}

export async function loadPosBootstrap(access: StaffSession): Promise<PosBootstrapPayload> {
  const context = await loadPosEmployeeContext(access.employee.id)
  const permissions = posPermissions(access)
  const status = await getPosSchemaStatus()
  const empty: PosBootstrapPayload = {
    schemaReady: false,
    capabilityVersion: status.version,
    branch: { id: context.locationId, name: context.branchName, timezone: context.timezone },
    catalogue: [],
    categories: [],
    tills: [],
    activeShift: null,
    balances: { openingFloat: 0, drawer: 0, reserve: 0 },
    suppliers: [],
    supplierSources: [],
    employees: [],
    closeouts: [],
    permissions,
    loadedAt: new Date().toISOString(),
  }
  if (!hasPosSchemaCapability(status)) return empty

  const service = getServiceSupabaseClient()
  const [
    catalogueResult,
    categoriesResult,
    assignmentsResult,
    pricingResult,
    tillsResult,
    shiftsResult,
    supplierResult,
    supplierSourcesResult,
    supplierEntriesResult,
    employeesResult,
    closeoutsResult,
  ] = await Promise.all([
    service
      .from('pos_catalogue_items')
      .select(
        'id,item_key,group_key,label,option_label,classification,default_direction,allowed_directions,tracked_source_type,source_required,customer_required,loyalty_eligible,points_per_gbp,allowed_payment_methods,note_required,price_required,shortcut,logo_key,is_system_action,is_quick_entry',
      )
      .eq('is_active', true)
      .eq('is_system_action', false)
      .eq('is_quick_entry', true)
      .order('display_order'),
    service
      .from('pos_categories')
      .select('id,category_key,label,description,icon_key,display_order,supplier_payments_enabled')
      .eq('is_active', true)
      .order('display_order'),
    service
      .from('pos_category_suppliers')
      .select('category_id,supplier_vendor_id,is_default')
      .eq('is_active', true),
    service
      .from('service_pricing')
      .select('id,category,section,service_name,service_option,sale_price')
      .eq('is_active', true)
      .order('service_name'),
    service
      .from('pos_tills')
      .select('id,till_code,name,currency')
      .eq('location_id', context.locationId)
      .eq('is_active', true)
      .order('created_at'),
    service
      .from('pos_shifts')
      .select(
        'id,till_id,business_date,status,opening_float,opened_at,pos_tills!pos_shifts_till_id_fkey(name),employees!pos_shifts_opened_by_fkey(full_name)',
      )
      .eq('location_id', context.locationId)
      .eq('status', 'OPEN')
      .order('opened_at')
      .limit(1),
    service
      .from('pos_supplier_profiles')
      .select(
        'supplier_vendor_id,alternate_names,source_area,source_reference,settlement_mode,logo_key,is_system,supplier_vendors(name)',
      )
      .eq('is_active', true)
      .order('created_at'),
    service
      .from('pos_supplier_source_history')
      .select('source_name,use_count,pos_categories!inner(category_key)')
      .eq('location_id', context.locationId)
      .order('last_used_at', { ascending: false })
      .limit(100),
    service
      .from('pos_supplier_balance_entries')
      .select('supplier_vendor_id,balance_delta')
      .eq('location_id', context.locationId)
      .order('created_at'),
    service
      .from('employees')
      .select('id,full_name')
      .eq('location_id', context.locationId)
      .eq('is_active', true)
      .order('full_name'),
    service
      .from('pos_closeouts')
      .select(
        'id,shift_id,status,expected_drawer,counted_drawer,drawer_difference,expected_reserve,counted_reserve,reserve_difference,counted_by,counted_at,pos_tills(name),employees!pos_closeouts_counted_by_fkey(full_name)',
      )
      .eq('location_id', context.locationId)
      .order('counted_at', { ascending: false })
      .limit(20),
  ])

  const failed = [
    catalogueResult,
    categoriesResult,
    assignmentsResult,
    pricingResult,
    tillsResult,
    shiftsResult,
    supplierResult,
    supplierEntriesResult,
    supplierSourcesResult,
    employeesResult,
    closeoutsResult,
  ].find((result) => result.error)
  if (failed?.error) throw failed.error

  const tills: PosTill[] = (tillsResult.data || []).map((row) => ({
    id: row.id,
    code: row.till_code,
    name: row.name,
    currency: 'GBP',
  }))
  const rawShift = shiftsResult.data?.[0] as unknown as
    | {
        id: string
        till_id: string
        business_date: string
        status: 'OPEN'
        opening_float: number | string
        opened_at: string
        pos_tills: Related<{ name: string }>
        employees: Related<{ full_name: string | null }>
      }
    | undefined
  const activeShift: PosShift | null = rawShift
    ? {
        id: rawShift.id,
        tillId: rawShift.till_id,
        tillName: first(rawShift.pos_tills)?.name || 'Till',
        businessDate: rawShift.business_date,
        status: rawShift.status,
        openingFloat: numeric(rawShift.opening_float),
        openedBy: first(rawShift.employees)?.full_name || 'Staff member',
        openedAt: rawShift.opened_at,
      }
    : null

  let balances: PosBalances = { openingFloat: 0, drawer: 0, reserve: 0 }
  if (activeShift) {
    const balanceResult = await service.rpc('pos_expected_balances_v1', {
      p_till_id: activeShift.tillId,
      p_shift_id: activeShift.id,
    })
    if (balanceResult.error) throw balanceResult.error
    const value = balanceResult.data as Record<string, unknown>
    balances = {
      openingFloat: numeric(value.openingFloat),
      drawer: numeric(value.drawer),
      reserve: numeric(value.reserve),
    }
  }

  const supplierBalances = new Map<string, number>()
  for (const entry of supplierEntriesResult.data || []) {
    supplierBalances.set(
      entry.supplier_vendor_id,
      (supplierBalances.get(entry.supplier_vendor_id) || 0) + numeric(entry.balance_delta),
    )
  }
  const suppliers: PosSupplier[] = (supplierResult.data || []).map((row) => {
    const supplier = first(row.supplier_vendors as Related<{ name: string }>)
    return {
      id: row.supplier_vendor_id,
      name: supplier?.name || 'Supplier',
      alternateNames: row.alternate_names || [],
      sourceArea: row.source_area,
      sourceReference: row.source_reference,
      balance: supplierBalances.get(row.supplier_vendor_id) || 0,
      isActive: true,
      settlementMode: row.settlement_mode as PosSupplier['settlementMode'],
      logoKey: row.logo_key,
      logoUrl: posLogoUrl(row.logo_key, 'supplier'),
      isSystem: Boolean(row.is_system),
    }
  })
  const closeouts: PosCloseout[] = (closeoutsResult.data || []).map((row) => {
    const till = first(row.pos_tills as Related<{ name: string }>)
    const counter = first(row.employees as Related<{ full_name: string | null }>)
    return {
      id: row.id,
      shiftId: row.shift_id,
      tillName: till?.name || 'Till',
      status: row.status as PosCloseout['status'],
      expectedDrawer: numeric(row.expected_drawer),
      countedDrawer: numeric(row.counted_drawer),
      drawerDifference: numeric(row.drawer_difference),
      expectedReserve: numeric(row.expected_reserve),
      countedReserve: numeric(row.counted_reserve),
      reserveDifference: numeric(row.reserve_difference),
      countedBy: counter?.full_name || 'Staff member',
      countedAt: row.counted_at,
      canApprove:
        permissions.canApprove &&
        row.status === 'PENDING_APPROVAL' &&
        row.counted_by !== access.employee.id,
    }
  })

  const catalogue = (catalogueResult.data || []).map((row) => {
    const item = mapCatalogue(row)
    item.pricingOptions = suggestPosPricing(
      {
        key: item.key,
        groupKey: item.groupKey,
        label: item.label,
        optionLabel: item.optionLabel,
      },
      pricingResult.data || [],
    ).map((price) => ({
      id: price.id,
      label: [price.service_name, price.service_option].filter(Boolean).join(' · '),
      price: numeric(price.sale_price),
    }))
    return item
  })

  return {
    ...empty,
    schemaReady: true,
    capabilityVersion: status.version,
    catalogue,
    categories: (categoriesResult.data || []).map((category) => {
      const assignments = (assignmentsResult.data || []).filter(
        (assignment) => assignment.category_id === category.id,
      )
      return {
        id: category.id,
        key: category.category_key,
        label: category.label,
        description: category.description,
        iconKey: category.icon_key,
        displayOrder: category.display_order,
        supplierPaymentsEnabled: category.supplier_payments_enabled,
        services: catalogue.filter((item) => item.categoryKey === category.category_key),
        shortcuts:
          category.category_key === 'other'
            ? [{ key: 'refund', label: 'Refund', target: 'REFUNDS_CORRECTIONS' as const }]
            : [],
        supplierIds: assignments.map((assignment) => assignment.supplier_vendor_id),
        defaultSupplierId:
          assignments.find((assignment) => assignment.is_default)?.supplier_vendor_id || null,
      }
    }),
    tills,
    activeShift,
    balances,
    suppliers,
    supplierSources: (supplierSourcesResult.data || []).map((row) => ({
      categoryKey:
        first(row.pos_categories as Related<{ category_key: string }>)?.category_key || '',
      name: row.source_name,
      useCount: Number(row.use_count) || 0,
    })),
    employees: (employeesResult.data || []).map((row) => ({
      id: row.id,
      name: row.full_name?.trim() || 'Staff member',
    })),
    closeouts,
  }
}

function publicPosError(error: SupabaseError): PosServerError {
  const hint = error.hint || ''
  const messages: Record<string, string> = {
    POS_SHIFT_REQUIRED: 'Open a till before recording this action.',
    POS_SHIFT_ALREADY_OPEN: 'This till already has an open shift.',
    POS_BUSINESS_DAY_ROLLOVER_REQUIRED: 'Close the previous business day and open a new shift.',
    POS_IDEMPOTENCY_CONFLICT: 'This retry key was already used for different details.',
    POS_DUPLICATE_WARNING: 'A similar transaction was posted recently.',
    POS_SOURCE_LINK_REQUIRED: 'This tracked service requires its source record.',
    POS_CATEGORY_REQUIRED: 'Choose an active POS category.',
    POS_SERVICE_REQUIRED: 'Choose an active service for this category.',
    POS_REMITTANCE_PROVIDER_REQUIRED: 'Choose a remittance provider.',
    POS_REMITTANCE_VOUCHER_LIMIT:
      'Remittance transactions accept only £2.50 or £5 loyalty vouchers. The voucher was not used.',
    POS_SUPPLIER_CATEGORY_FORBIDDEN: 'This supplier is not assigned to the selected category.',
    POS_SHADOW_DEBT_FORBIDDEN: 'Link the remaining balance to LMS or the tracked service.',
    POS_INSUFFICIENT_DRAWER: 'The expected drawer cash is insufficient.',
    POS_INSUFFICIENT_RESERVE: 'The expected coin reserve is insufficient.',
    POS_INSUFFICIENT_SUPPLIER_BALANCE: 'The supplier balance is insufficient.',
    POS_SUPPLIER_CORRECTION_NOTE_REQUIRED: 'Add a note explaining the supplier deposit correction.',
    POS_PAY_ON_DEMAND_CORRECTION_FORBIDDEN:
      'Pay-on-demand supplier corrections must be handled in Accounting.',
    POS_SUPPLIER_SOURCE_REQUIRED: 'Enter the ticketing supplier source.',
    POS_TENDER_DESTINATION_INVALID:
      'Only remittance card or bank payments can be paid directly to a provider.',
    POS_REFUND_EXCEEDS_REMAINING: 'The refund exceeds the remaining refundable amount.',
    POS_REFUND_WORKFLOW_REQUIRED:
      'Use Refunds & corrections so the original payment and approval evidence are retained.',
    POS_MANAGER_VERIFICATION_REQUIRED: 'Manager access and fresh verification are required.',
    POS_LOYALTY_MANAGER_REVIEW_REQUIRED:
      'Manager review is required because points may have been redeemed.',
    POS_INDEPENDENT_APPROVER_REQUIRED: 'A different manager must approve this closeout.',
    POS_CLOSEOUT_APPROVAL_REQUIRED: 'The previous closeout needs manager approval.',
    POS_PRICING_CONFIRMATION_REQUIRED:
      'Select the matching price option or confirm the manual total.',
    POS_VOUCHER_CODE_INVALID: 'Scan a valid Piyam loyalty voucher.',
    POS_VOUCHER_NOT_FOUND: 'Voucher not found.',
    POS_VOUCHER_EXPIRED: 'This voucher has expired.',
    POS_VOUCHER_ALREADY_USED: 'This voucher has already been used or cancelled.',
    POS_VOUCHER_ACCOUNT_INACTIVE: 'The voucher loyalty account is inactive.',
    POS_VOUCHER_MEMBER_MISMATCH: 'The voucher and loyalty card belong to different accounts.',
    POS_VOUCHER_NOT_ELIGIBLE: 'Vouchers can only be used for customer sales.',
    POS_VOUCHER_TENDER_FORBIDDEN: 'Use the voucher scanner to apply a loyalty voucher.',
  }
  const status =
    error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400
  return new PosServerError(
    messages[hint] || 'The POS action could not be completed.',
    status,
    hint || error.code || 'POS_ERROR',
  )
}

export async function runPosMutation(
  functionName:
    | 'pos_open_shift_v1'
    | 'pos_record_cash_movement_v1'
    | 'pos_close_shift_v1'
    | 'pos_approve_closeout_v1'
    | 'pos_post_transaction_v1'
    | 'pos_post_transaction_v2'
    | 'pos_post_transaction_v3'
    | 'pos_post_transaction_v5'
    | 'pos_post_transaction_v6'
    | 'pos_post_transaction_v7'
    | 'pos_manage_configuration_v2'
    | 'pos_manage_configuration_v3'
    | 'pos_manage_configuration_v4'
    | 'pos_record_refund_v2'
    | 'pos_configure_supplier_v1'
    | 'pos_correct_expense_v1'
    | 'pos_record_reconciliation_v1'
    | 'pos_import_legacy_row_v1',
  actorEmployeeId: string,
  idempotencyKey: string,
  request: Record<string, unknown>,
): Promise<PosMutationResult> {
  const status = await getPosSchemaStatus()
  if (!hasPosSchemaCapability(status, POS_CAPABILITY_VERSION)) {
    throw new PosServerError(
      'The POS database upgrade is not installed yet.',
      503,
      'POS_SCHEMA_NOT_READY',
    )
  }
  const parameter = functionName === 'pos_import_legacy_row_v1' ? 'p_row' : 'p_request'
  const { data, error } = await getServiceSupabaseClient().rpc(functionName, {
    p_actor_employee_id: actorEmployeeId,
    p_idempotency_key: idempotencyKey,
    [parameter]: request,
  })
  if (error) throw publicPosError(error)
  return data as PosMutationResult
}

export async function lookupPosLoyaltyMember(rawCode: string) {
  let customerCode: string
  try {
    customerCode = normalizeCustomerLoyaltyCode(rawCode)
  } catch {
    throw new PosServerError('Scan a valid Piyam loyalty QR code.', 400, 'POS_LOYALTY_CODE_INVALID')
  }
  const service = getServiceSupabaseClient()
  const { data: member, error: memberError } = await service
    .from('mobile_users')
    .select('id,customer_code,email')
    .eq('customer_code', customerCode)
    .eq('customer_lifecycle_status', 'active')
    .maybeSingle()
  if (memberError) {
    console.error('POS loyalty lookup failed', {
      code: memberError.code,
      request: 'member',
    })
    throw new PosServerError(
      'Loyalty lookup is temporarily unavailable.',
      503,
      'POS_LOYALTY_LOOKUP_UNAVAILABLE',
    )
  }
  if (!member)
    throw new PosServerError('Active loyalty member not found.', 404, 'POS_LOYALTY_NOT_FOUND')

  const { data: awards, error: awardsError } = await service
    .from('customer_loyalty_awards')
    .select('points,state')
    .eq('mobile_user_id', member.id)
  if (awardsError) {
    console.error('POS loyalty lookup failed', {
      code: awardsError.code,
      request: 'balance',
    })
    throw new PosServerError(
      'Loyalty lookup is temporarily unavailable.',
      503,
      'POS_LOYALTY_LOOKUP_UNAVAILABLE',
    )
  }
  const availablePoints = (awards || []).reduce(
    (total, award) => (award.state === 'available' ? total + numeric(award.points) : total),
    0,
  )
  return {
    id: member.id,
    customerCode,
    maskedCode: `${customerCode.slice(0, 8)}••••${customerCode.slice(-2)}`,
    name: 'Loyalty member',
    maskedEmail: member.email
      ? member.email.replace(/^(.{1,2}).*(@.*)$/, '$1•••$2')
      : 'Email not recorded',
    availablePoints,
  }
}

export async function lookupPosLoyaltyVoucher(rawCode: string) {
  const voucherCode = rawCode.trim().toUpperCase()
  if (!/^PYV-[A-F0-9]{20}$/.test(voucherCode)) {
    throw new PosServerError('Scan a valid Piyam loyalty voucher.', 400, 'POS_VOUCHER_CODE_INVALID')
  }
  const service = getServiceSupabaseClient()
  const { data: voucher, error } = await service
    .from('customer_loyalty_vouchers')
    .select('voucher_code,value_pence,status,expires_at,mobile_user_id')
    .eq('voucher_code', voucherCode)
    .maybeSingle()
  if (error) {
    console.error('POS voucher lookup failed', { code: error.code })
    throw new PosServerError(
      'Voucher lookup is temporarily unavailable.',
      503,
      'POS_VOUCHER_LOOKUP_UNAVAILABLE',
    )
  }
  if (!voucher) throw new PosServerError('Voucher not found.', 404, 'POS_VOUCHER_NOT_FOUND')
  if (voucher.status !== 'issued') {
    throw new PosServerError(
      'This voucher is no longer available.',
      409,
      'POS_VOUCHER_ALREADY_USED',
    )
  }
  if (new Date(voucher.expires_at).getTime() <= Date.now()) {
    throw new PosServerError('This voucher has expired.', 400, 'POS_VOUCHER_EXPIRED')
  }
  const { data: member, error: memberError } = await service
    .from('mobile_users')
    .select('id,customer_code,email')
    .eq('id', voucher.mobile_user_id)
    .eq('customer_lifecycle_status', 'active')
    .maybeSingle()
  if (memberError || !member?.customer_code) {
    throw new PosServerError(
      'The voucher loyalty account is inactive.',
      400,
      'POS_VOUCHER_ACCOUNT_INACTIVE',
    )
  }
  const { data: awards, error: awardsError } = await service
    .from('customer_loyalty_awards')
    .select('points,state')
    .eq('mobile_user_id', member.id)
  if (awardsError)
    throw new PosServerError(
      'Voucher lookup is temporarily unavailable.',
      503,
      'POS_VOUCHER_LOOKUP_UNAVAILABLE',
    )
  const availablePoints = (awards || []).reduce(
    (total, award) => (award.state === 'available' ? total + numeric(award.points) : total),
    0,
  )
  return {
    voucherCode,
    maskedCode: `${voucherCode.slice(0, 8)}••••${voucherCode.slice(-4)}`,
    valuePence: Number(voucher.value_pence),
    expiresAt: voucher.expires_at,
    member: {
      id: member.id,
      customerCode: member.customer_code,
      maskedCode: `${member.customer_code.slice(0, 8)}••••${member.customer_code.slice(-2)}`,
      name: 'Loyalty member',
      maskedEmail: member.email
        ? member.email.replace(/^(.{1,2}).*(@.*)$/, '$1•••$2')
        : 'Email not recorded',
      availablePoints,
    },
  }
}

export async function loadPosSupplierLedger(
  access: StaffSession,
  supplierId?: string,
): Promise<PosSupplierLedgerPayload> {
  const [bootstrap, context] = await Promise.all([
    loadPosBootstrap(access),
    loadPosEmployeeContext(access.employee.id),
  ])
  if (!bootstrap.schemaReady) return { suppliers: [], entries: [] }

  let query = getServiceSupabaseClient()
    .from('pos_supplier_balance_entries')
    .select(
      'id,supplier_vendor_id,movement_type,balance_delta,reference,note,created_at,supplier_vendors(name),employees!pos_supplier_balance_entries_created_by_fkey(full_name)',
    )
    .eq('location_id', context.locationId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (supplierId) query = query.eq('supplier_vendor_id', supplierId)
  const { data, error } = await query
  if (error) throw error

  const runningBalances = new Map(
    bootstrap.suppliers.map((supplier) => [supplier.id, supplier.balance]),
  )
  const entries: PosSupplierBalanceEntry[] = (data || []).map((row) => {
    const delta = numeric(row.balance_delta)
    const runningBalance = runningBalances.get(row.supplier_vendor_id) || 0
    runningBalances.set(row.supplier_vendor_id, runningBalance - delta)
    return {
      id: row.id,
      supplierId: row.supplier_vendor_id,
      supplierName:
        first(row.supplier_vendors as Related<{ name: string | null }>)?.name || 'Supplier',
      movementType: row.movement_type as PosSupplierBalanceEntry['movementType'],
      amount: Math.abs(delta),
      balanceDelta: delta,
      runningBalance,
      reference: row.reference,
      note: row.note || '',
      createdBy:
        first(row.employees as Related<{ full_name: string | null }>)?.full_name || 'Staff member',
      createdAt: row.created_at,
    }
  })
  return { suppliers: bootstrap.suppliers, entries }
}

export async function loadPosReceipt(access: StaffSession, transactionId: string) {
  const context = await loadPosEmployeeContext(access.employee.id)
  const { data, error } = await getServiceSupabaseClient()
    .from('pos_transactions')
    .select(
      'id,reference_number,business_date,occurred_at,customer_name,total_amount,amount_paid,balance_remaining,direction,note,status,loyalty_points_awarded,category_label_snapshot,service_label_snapshot,supplier_name_snapshot,pos_catalogue_items(label,option_label),pos_tills(name),employees!pos_transactions_created_by_fkey(full_name),pos_transaction_tenders(payment_method,amount,external_reference,reconciliation_status),pos_transaction_source_links(source_type,namespace,record_id,display_reference)',
    )
    .eq('id', transactionId)
    .eq('location_id', context.locationId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new PosServerError('POS transaction not found.', 404, 'POS_NOT_FOUND')
  return {
    branchName: context.branchName,
    timezone: context.timezone,
    transaction: data,
  }
}

export async function posRefundNeedsManager(input: {
  refundKind: 'LINKED' | 'GENERAL'
  amount: number
  originalTransactionId?: string
}) {
  if (input.refundKind === 'GENERAL' || input.amount >= 500) return true
  if (!input.originalTransactionId) return false
  const { data, error } = await getServiceSupabaseClient()
    .from('pos_transactions')
    .select('pos_shifts(status)')
    .eq('id', input.originalTransactionId)
    .maybeSingle()
  if (error) throw error
  const shift = first(
    (data as unknown as { pos_shifts: Related<{ status: string }> } | null)?.pos_shifts || null,
  )
  return shift?.status === 'CLOSED'
}
