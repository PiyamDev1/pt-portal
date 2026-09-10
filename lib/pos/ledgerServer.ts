import 'server-only'

import { Buffer } from 'node:buffer'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import type {
  PosAuditEvent,
  PosLedgerFilters,
  PosLedgerPayload,
  PosLedgerPaymentMethod,
  PosLedgerPeriod,
  PosLedgerSummary,
  PosLedgerTender,
  PosLedgerTransaction,
  PosPaymentMethod,
  PosReconciliationStatus,
  PosRefundSummary,
  PosSourceLink,
} from '@/lib/pos/contracts'
import { getPosSchemaStatus, loadPosEmployeeContext } from '@/lib/pos/server'
import { hasPosSchemaCapability } from '@/lib/pos/schemaCapability'

const POS_LEDGER_LIMIT = 500
export const POS_TRANSACTION_SUPPLIER_RELATION =
  'supplier:supplier_vendors!pos_transactions_supplier_vendor_id_fkey(name)'
type Related<T> = T | T[] | null

type EmployeeLocationRow = {
  location_id: string | null
  locations: Related<{ id: string; name: string; timezone: string }>
}

type BranchEmployeeRow = { id: string; full_name: string | null }

type LegacyLedgerRow = {
  id: string
  work_date: string
  created_at: string
  customer_full_name: string | null
  remark: string | null
  source_link_id: string | null
  total_amount: number | string
  employee_id: string
  accounting_category: Related<{ name: string; type: 'INCOME' | 'EXPENSE' }>
  supplier: Related<{ name: string }>
  daily_payment_splits: Array<{
    amount: number | string
    transaction_type: 'INCOME' | 'EXPENSE'
    reconciliation_status: 'CLEARED' | 'OWED_TO_US' | 'UNPAID_DEBT_IN'
    transaction_method: Related<{ name: string }>
  }> | null
}

type ReconciliationEventRow = {
  status: PosReconciliationStatus
  external_reference: string | null
  created_at: string
  id: number
}

type PosTenderRow = {
  id: string
  payment_method: PosPaymentMethod
  amount: number | string
  destination?: 'OUR_ACCOUNT' | 'SUPPLIER_DIRECT'
  external_reference: string | null
  reconciliation_status: PosReconciliationStatus
  pos_reconciliation_events: ReconciliationEventRow[] | null
}

type PosRefundRow = {
  id: string
  reference_number: string
  business_date: string
  original_transaction_id: string | null
  refund_kind: 'LINKED' | 'GENERAL'
  amount: number | string
  status: PosReconciliationStatus
  reason_code: string
  note: string
  supporting_reference: string | null
  original_evidence: Record<string, unknown>
  loyalty_points_reversed: number
  created_at: string
  created_by: string
  till_id: string
  shift_id: string
  pos_refund_tenders: PosTenderRow[] | null
  pos_tills: Related<{ name: string }>
  employees: Related<{ id: string; full_name: string | null }>
  pos_transactions: Related<{
    reference_number: string
    customer_name: string
    category_label_snapshot: string
    service_label_snapshot: string
    catalogue: Related<{ label: string; option_label: string | null }>
  }>
}

type PosTransactionRow = {
  id: string
  reference_number: string
  business_date: string
  occurred_at: string
  transaction_kind: string
  direction: 'IN' | 'OUT'
  outgoing_type: 'REFUND' | 'EXPENSE' | 'SUPPLIER_PAYMENT' | null
  total_amount: number | string
  amount_paid: number | string
  customer_name: string
  loyalty_mobile_user_id: string | null
  loyalty_points_awarded: number
  supplier_vendor_id: string | null
  supplier_movement_type: string | null
  category_label_snapshot: string
  service_label_snapshot: string
  supplier_name_snapshot: string | null
  note: string | null
  created_by: string
  till_id: string
  shift_id: string
  legacy_source: string | null
  catalogue: Related<{
    item_key: string
    label: string
    option_label: string | null
  }>
  employee: Related<{ id: string; full_name: string | null }>
  till: Related<{ name: string }>
  supplier: Related<{ name: string }>
  pos_transaction_tenders: PosTenderRow[] | null
  pos_transaction_source_links: Array<{
    id: string
    source_type: PosSourceLink['sourceType']
    source_namespace: string | null
    source_record_id: string
    display_reference: string | null
  }> | null
  pos_refunds: Array<{
    id: string
    reference_number: string
    amount: number | string
    status: PosReconciliationStatus
    reason_code: string
    created_at: string
    loyalty_points_reversed: number
  }> | null
  pos_corrections: Array<{ id: string }> | null
}

type PosAuditRow = {
  id: number
  entity_type: string
  entity_id: string
  event_type: string
  event_summary: string
  created_at: string
  employees: Related<{ full_name: string | null }>
}

export class PosLedgerAccessError extends Error {}

function firstRelated<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function posLedgerPeriodBounds(date: string, period: PosLedgerPeriod) {
  if (!isIsoDate(date)) throw new Error('Invalid POS ledger date')
  if (period === 'day') return { startDate: date, endDate: date }
  const startDate = `${date.slice(0, 7)}-01`
  const nextMonth = new Date(`${startDate}T00:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  nextMonth.setUTCDate(0)
  return { startDate, endDate: nextMonth.toISOString().slice(0, 10) }
}

function methodLabel(method: PosPaymentMethod | string): Exclude<PosLedgerPaymentMethod, 'Split'> {
  const normalized = method.toUpperCase()
  if (normalized === 'CASH' || normalized.includes('CASH')) return 'Cash'
  if (normalized === 'CARD' || normalized.includes('CARD')) return 'Card'
  if (normalized === 'BANK' || normalized.includes('BANK') || normalized.includes('TRANSFER'))
    return 'Bank'
  return 'Other'
}

function formatTime(createdAt: string, timezone: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.valueOf())) return '--:--'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date)
}

function latestReconciliation(tender: PosTenderRow) {
  return [...(tender.pos_reconciliation_events || [])].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) || Number(right.id) - Number(left.id),
  )[0]
}

function mapTender(tender: PosTenderRow, direction: 'IN' | 'OUT'): PosLedgerTender {
  const latest = latestReconciliation(tender)
  const amount = numberValue(tender.amount)
  return {
    id: tender.id,
    method:
      tender.payment_method === 'OTHER' &&
      /^PYV-[A-F0-9]{20}$/.test(tender.external_reference || '')
        ? 'Voucher'
        : methodLabel(tender.payment_method),
    methodCode: tender.payment_method,
    amount,
    direction,
    reconciliationStatus: latest?.status || tender.reconciliation_status,
    externalReference: latest?.external_reference || tender.external_reference,
    destination: tender.destination,
    cashImpact: tender.payment_method === 'CASH' ? amount * (direction === 'OUT' ? -1 : 1) : 0,
  }
}

function displayMethod(tenders: PosLedgerTender[]): PosLedgerPaymentMethod {
  const methods = [...new Set(tenders.map((tender) => tender.method))]
  return methods.length > 1 ? 'Split' : methods[0] || 'Other'
}

function mapAudit(row: PosAuditRow): PosAuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    summary: row.event_summary,
    actor: firstRelated(row.employees)?.full_name || 'Staff member',
    createdAt: row.created_at,
  }
}

function mapPosTransaction(
  row: PosTransactionRow,
  timezone: string,
  audit: Map<string, PosAuditEvent[]>,
): PosLedgerTransaction {
  const catalogue = firstRelated(row.catalogue)
  const employee = firstRelated(row.employee)
  const till = firstRelated(row.till)
  const supplier = firstRelated(row.supplier)
  const tenders = (row.pos_transaction_tenders || []).map((tender) =>
    mapTender(tender, row.direction),
  )
  const refunds: PosRefundSummary[] = (row.pos_refunds || []).map((refund) => ({
    id: refund.id,
    reference: refund.reference_number,
    amount: numberValue(refund.amount),
    status: refund.status,
    reasonCode: refund.reason_code,
    createdAt: refund.created_at,
    pointsReversed: refund.loyalty_points_reversed,
  }))
  const refunded = refunds
    .filter((refund) => refund.status !== 'FAILED')
    .reduce((sum, refund) => sum + refund.amount, 0)
  const amountPaid = numberValue(row.amount_paid)
  const corrected = Boolean(row.pos_corrections?.length)
  const hasPendingTender = tenders.some(
    (tender) =>
      tender.destination !== 'SUPPLIER_DIRECT' &&
      !['COMPLETED', 'CLEARED'].includes(tender.reconciliationStatus),
  )
  const status = corrected
    ? 'Corrected'
    : refunded >= amountPaid && amountPaid > 0
      ? 'Refunded'
      : refunded > 0
        ? 'Partially refunded'
        : hasPendingTender
          ? 'Unreconciled'
          : row.transaction_kind === 'LEGACY_IMPORT'
            ? 'Imported'
            : row.transaction_kind === 'CORRECTION'
              ? 'Correction'
              : 'Posted'
  const sourceLinks: PosSourceLink[] = (row.pos_transaction_source_links || []).map((link) => ({
    id: link.id,
    sourceType: link.source_type,
    namespace: link.source_namespace,
    recordId: link.source_record_id,
    displayReference: link.display_reference,
  }))
  const totalAmount = numberValue(row.total_amount)
  const signed = row.direction === 'OUT' ? -totalAmount : totalAmount
  return {
    id: row.id,
    reference: row.reference_number,
    date: row.business_date,
    time: formatTime(row.occurred_at, timezone),
    occurredAt: row.occurred_at,
    name: row.customer_name,
    category: [
      row.category_label_snapshot || catalogue?.label || 'Uncategorised',
      row.service_label_snapshot,
    ]
      .filter(Boolean)
      .join(' · '),
    categoryKey: catalogue?.item_key,
    option: row.service_label_snapshot || catalogue?.option_label || null,
    method: displayMethod(tenders),
    amount: signed,
    accountImpact: tenders
      .filter((tender) => tender.destination !== 'SUPPLIER_DIRECT')
      .reduce(
        (sum, tender) => sum + (tender.direction === 'OUT' ? -tender.amount : tender.amount),
        0,
      ),
    totalAmount,
    amountPaid,
    balanceRemaining: Math.max(totalAmount - amountPaid, 0),
    cashImpact: row.legacy_source
      ? 0
      : tenders.reduce((sum, tender) => sum + (tender.cashImpact || 0), 0),
    points: row.loyalty_points_awarded,
    pointsReversed: refunds.reduce((sum, refund) => sum + refund.pointsReversed, 0),
    status,
    note: row.note || '',
    supplier: row.supplier_name_snapshot || supplier?.name,
    supplierId: row.supplier_vendor_id,
    supplierMovementType: row.supplier_movement_type,
    entryAgent: employee?.full_name || 'Staff member',
    entryAgentId: row.created_by,
    tillId: row.till_id,
    tillName: till?.name || 'Till',
    shiftId: row.shift_id,
    outgoingType: row.outgoing_type,
    loyaltyAttached: Boolean(row.loyalty_mobile_user_id),
    loyaltyMemberMasked: row.loyalty_mobile_user_id
      ? `Member ••••${row.loyalty_mobile_user_id.slice(-4)}`
      : null,
    refundableRemaining: row.direction === 'IN' ? Math.max(amountPaid - refunded, 0) : 0,
    sourceLinkId: sourceLinks[0]?.recordId || null,
    sourceLinks,
    refunds,
    auditEvents: audit.get(row.id) || [],
    tenders,
    isLegacy: Boolean(row.legacy_source),
    isCorrected: corrected,
  }
}

function mapPosRefund(
  row: PosRefundRow,
  timezone: string,
  audit: Map<string, PosAuditEvent[]>,
): PosLedgerTransaction {
  const original = firstRelated(row.pos_transactions)
  const catalogue = firstRelated(original?.catalogue || null)
  const employee = firstRelated(row.employees)
  const till = firstRelated(row.pos_tills)
  const tenders = (row.pos_refund_tenders || []).map((tender) => mapTender(tender, 'OUT'))
  const amount = numberValue(row.amount)
  const evidence = row.original_evidence || {}
  return {
    id: row.id,
    reference: row.reference_number,
    date: row.business_date,
    time: formatTime(row.created_at, timezone),
    occurredAt: row.created_at,
    name: original?.customer_name || String(evidence.customerName || 'Unknown customer'),
    category:
      row.refund_kind === 'GENERAL'
        ? `General refund · ${String(evidence.service || 'Unknown service')}`
        : `Refund · ${[
            original?.category_label_snapshot || catalogue?.label,
            original?.service_label_snapshot || catalogue?.option_label,
          ]
            .filter(Boolean)
            .join(' · ')}`,
    categoryKey: 'general-refund',
    method: displayMethod(tenders),
    amount: -amount,
    totalAmount: amount,
    amountPaid: amount,
    balanceRemaining: 0,
    cashImpact: -tenders
      .filter((tender) => tender.methodCode === 'CASH')
      .reduce((sum, tender) => sum + tender.amount, 0),
    points: -row.loyalty_points_reversed,
    pointsReversed: row.loyalty_points_reversed,
    status:
      row.refund_kind === 'GENERAL' ? `General refund · ${row.status}` : `Refund · ${row.status}`,
    note: row.note,
    entryAgent: employee?.full_name || 'Staff member',
    entryAgentId: row.created_by,
    tillId: row.till_id,
    tillName: till?.name || 'Till',
    shiftId: row.shift_id,
    outgoingType: 'REFUND',
    loyaltyAttached: row.loyalty_points_reversed > 0,
    sourceLinkId: row.original_transaction_id,
    sourceLinks: row.original_transaction_id
      ? [
          {
            id: `${row.id}:original`,
            sourceType: 'POS',
            namespace: 'refund',
            recordId: row.original_transaction_id,
            displayReference: original?.reference_number || null,
          },
        ]
      : [],
    refunds: [],
    auditEvents: audit.get(row.id) || [],
    tenders,
    refundableRemaining: 0,
  }
}

export function summarizePosLedgerItems(items: PosLedgerTransaction[]): PosLedgerSummary {
  const summary: PosLedgerSummary = {
    moneyIn: 0,
    moneyOut: 0,
    netMovement: 0,
    cashNet: 0,
    cashIn: 0,
    cashOut: 0,
    cashRefunds: 0,
    cardNet: 0,
    bankNet: 0,
    refunds: 0,
    unreconciledCount: 0,
    activeDays: new Set(items.map((item) => item.date)).size,
  }
  for (const item of items) {
    const accountImpact = item.accountImpact ?? item.amount
    summary.moneyIn += Math.max(accountImpact, 0)
    summary.moneyOut += Math.abs(Math.min(accountImpact, 0))
    summary.netMovement += accountImpact
    summary.cashNet += item.cashImpact || 0
    summary.cashIn = (summary.cashIn || 0) + Math.max(item.cashImpact || 0, 0)
    summary.cashOut = (summary.cashOut || 0) + Math.abs(Math.min(item.cashImpact || 0, 0))
    if (item.outgoingType === 'REFUND') {
      summary.refunds = (summary.refunds || 0) + Math.abs(item.amount)
      summary.cashRefunds = (summary.cashRefunds || 0) + Math.abs(Math.min(item.cashImpact || 0, 0))
    }
    for (const tender of item.tenders) {
      const signedAmount = tender.direction === 'OUT' ? -tender.amount : tender.amount
      if (tender.destination !== 'SUPPLIER_DIRECT' && tender.method === 'Card')
        summary.cardNet += signedAmount
      if (tender.destination !== 'SUPPLIER_DIRECT' && tender.method === 'Bank')
        summary.bankNet += signedAmount
      if (
        tender.destination !== 'SUPPLIER_DIRECT' &&
        !['COMPLETED', 'CLEARED'].includes(tender.reconciliationStatus)
      )
        summary.unreconciledCount += 1
    }
  }
  return summary
}

function passesFilters(item: PosLedgerTransaction, filters: PosLedgerFilters) {
  if (
    filters.paymentMethod &&
    !item.tenders.some((tender) => tender.methodCode === filters.paymentMethod)
  )
    return false
  if (filters.direction && (item.amount < 0 ? 'OUT' : 'IN') !== filters.direction) return false
  if (filters.outgoingType && item.outgoingType !== filters.outgoingType) return false
  if (filters.supplierId && item.supplierId !== filters.supplierId) return false
  if (
    filters.sourceType &&
    !item.sourceLinks?.some((link) => link.sourceType === filters.sourceType)
  )
    return false
  if (filters.loyalty === 'ATTACHED' && !item.loyaltyAttached) return false
  if (filters.loyalty === 'AWARDED' && item.points <= 0) return false
  if (filters.loyalty === 'REVERSED' && !item.pointsReversed) return false
  if (filters.loyalty === 'NONE' && item.loyaltyAttached) return false
  if (filters.status === 'REFUNDED' && item.status !== 'Refunded') return false
  if (filters.status === 'PARTIALLY_REFUNDED' && item.status !== 'Partially refunded') return false
  if (filters.status === 'CORRECTED' && item.status !== 'Corrected') return false
  if (
    filters.status === 'UNRECONCILED' &&
    !item.tenders.some(
      (tender) =>
        tender.destination !== 'SUPPLIER_DIRECT' &&
        !['COMPLETED', 'CLEARED'].includes(tender.reconciliationStatus),
    )
  )
    return false
  if (filters.status === 'POSTED' && item.status !== 'Posted') return false
  return true
}

function parseCursor(cursor: string | undefined) {
  if (!cursor) return null
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Record<string, unknown>
    if (typeof value.occurredAt !== 'string' || typeof value.id !== 'string') return undefined
    return { occurredAt: value.occurredAt, id: value.id }
  } catch {
    return undefined
  }
}

function createCursor(item: PosLedgerTransaction | undefined) {
  if (!item?.occurredAt) return null
  return Buffer.from(JSON.stringify({ occurredAt: item.occurredAt, id: item.id })).toString(
    'base64url',
  )
}

async function loadPosLedgerRows(
  employeeId: string,
  period: PosLedgerPeriod,
  date: string,
  filters: PosLedgerFilters,
  cursorValue?: string,
): Promise<PosLedgerPayload> {
  const { startDate, endDate } = posLedgerPeriodBounds(date, period)
  const context = await loadPosEmployeeContext(employeeId)
  const cursor = parseCursor(cursorValue)
  if (cursor === undefined) throw new Error('Invalid POS ledger cursor')
  const service = getServiceSupabaseClient()
  let transactionQuery = service
    .from('pos_transactions')
    .select(
      `
      id,reference_number,business_date,occurred_at,transaction_kind,direction,outgoing_type,
      total_amount,amount_paid,customer_name,loyalty_mobile_user_id,loyalty_points_awarded,
      supplier_vendor_id,supplier_movement_type,category_label_snapshot,service_label_snapshot,
      supplier_name_snapshot,note,created_by,till_id,shift_id,legacy_source,
      catalogue:pos_catalogue_items!inner(item_key,label,option_label),
      employee:employees!pos_transactions_created_by_fkey(id,full_name),
      till:pos_tills!pos_transactions_till_id_fkey(name),
      ${POS_TRANSACTION_SUPPLIER_RELATION},
      pos_transaction_tenders(id,payment_method,amount,destination,external_reference,reconciliation_status,
        pos_reconciliation_events(status,external_reference,created_at,id)),
      pos_transaction_source_links(id,source_type,source_namespace,source_record_id,display_reference),
      pos_refunds(id,reference_number,amount,status,reason_code,created_at,loyalty_points_reversed),
      pos_corrections!pos_corrections_original_transaction_id_fkey(id)
    `,
    )
    .eq('location_id', context.locationId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
  if (filters.search)
    transactionQuery = transactionQuery.textSearch('search_document', filters.search, {
      type: 'websearch',
      config: 'simple',
    })
  if (filters.categoryKey)
    transactionQuery = transactionQuery.eq('catalogue.item_key', filters.categoryKey)
  if (filters.tillId) transactionQuery = transactionQuery.eq('till_id', filters.tillId)
  if (filters.shiftId) transactionQuery = transactionQuery.eq('shift_id', filters.shiftId)
  if (filters.agentId) transactionQuery = transactionQuery.eq('created_by', filters.agentId)
  if (filters.minAmount !== undefined)
    transactionQuery = transactionQuery.gte('total_amount', filters.minAmount)
  if (filters.maxAmount !== undefined)
    transactionQuery = transactionQuery.lte('total_amount', filters.maxAmount)
  if (cursor)
    transactionQuery = transactionQuery.or(
      `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
    )

  let refundQuery = service
    .from('pos_refunds')
    .select(
      `
      id,reference_number,business_date,original_transaction_id,refund_kind,amount,status,
      reason_code,note,supporting_reference,original_evidence,loyalty_points_reversed,
      created_at,created_by,till_id,shift_id,
      pos_refund_tenders(id,payment_method,amount,external_reference,reconciliation_status,
        pos_reconciliation_events(status,external_reference,created_at,id)),
      pos_tills!pos_refunds_till_id_fkey(name),employees!pos_refunds_created_by_fkey(id,full_name),
      pos_transactions(reference_number,customer_name,category_label_snapshot,service_label_snapshot,catalogue:pos_catalogue_items(label,option_label))
    `,
    )
    .eq('location_id', context.locationId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
  if (filters.search)
    refundQuery = refundQuery.textSearch('search_document', filters.search, {
      type: 'websearch',
      config: 'simple',
    })
  if (filters.tillId) refundQuery = refundQuery.eq('till_id', filters.tillId)
  if (filters.shiftId) refundQuery = refundQuery.eq('shift_id', filters.shiftId)
  if (filters.agentId) refundQuery = refundQuery.eq('created_by', filters.agentId)
  if (filters.minAmount !== undefined) refundQuery = refundQuery.gte('amount', filters.minAmount)
  if (filters.maxAmount !== undefined) refundQuery = refundQuery.lte('amount', filters.maxAmount)
  if (cursor)
    refundQuery = refundQuery.or(
      `created_at.lt.${cursor.occurredAt},and(created_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
    )

  const [transactionResult, refundResult] = await Promise.all([
    transactionQuery
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(POS_LEDGER_LIMIT + 1),
    refundQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(POS_LEDGER_LIMIT + 1),
  ])
  if (transactionResult.error) throw transactionResult.error
  if (refundResult.error) throw refundResult.error
  const transactionRows = (transactionResult.data || []) as unknown as PosTransactionRow[]
  const refundRows = (refundResult.data || []) as unknown as PosRefundRow[]
  const entityIds = [...transactionRows.map((row) => row.id), ...refundRows.map((row) => row.id)]
  const audit = new Map<string, PosAuditEvent[]>()
  if (entityIds.length > 0) {
    const auditResult = await service
      .from('pos_audit_events')
      .select(
        'id,entity_type,entity_id,event_type,event_summary,created_at,employees!pos_audit_events_actor_employee_id_fkey(full_name)',
      )
      .in('entity_id', entityIds)
      .order('created_at')
      .order('id')
    if (auditResult.error) throw auditResult.error
    for (const row of (auditResult.data || []) as unknown as PosAuditRow[]) {
      audit.set(row.entity_id, [...(audit.get(row.entity_id) || []), mapAudit(row)])
    }
  }

  const combined = [
    ...transactionRows.map((row) => mapPosTransaction(row, context.timezone, audit)),
    ...refundRows.map((row) => mapPosRefund(row, context.timezone, audit)),
  ]
    .filter((item) => passesFilters(item, filters))
    .sort(
      (left, right) =>
        (right.occurredAt || '').localeCompare(left.occurredAt || '') ||
        right.id.localeCompare(left.id),
    )
  const hasMore =
    transactionRows.length > POS_LEDGER_LIMIT ||
    refundRows.length > POS_LEDGER_LIMIT ||
    combined.length > POS_LEDGER_LIMIT
  const items = combined.slice(0, POS_LEDGER_LIMIT)
  return {
    items,
    summary: summarizePosLedgerItems(items),
    nextCursor: hasMore ? createCursor(items.at(-1)) : null,
    context: {
      branchId: context.locationId,
      branchName: context.branchName,
      timezone: context.timezone,
      period,
      date,
      loadedAt: new Date().toISOString(),
      source: 'pos_transactions',
      truncated: hasMore,
      filters,
    },
  }
}

function legacyReference(row: LegacyLedgerRow) {
  return `POS-${row.work_date.replace(/-/g, '')}-${row.id.slice(0, 8).toUpperCase()}`
}

function legacyTransaction(
  row: LegacyLedgerRow,
  employeeNames: Map<string, string>,
  timezone: string,
): PosLedgerTransaction {
  const category = firstRelated(row.accounting_category)
  const supplier = firstRelated(row.supplier)
  const tenders: PosLedgerTender[] = (row.daily_payment_splits || []).map((split) => ({
    method: methodLabel(firstRelated(split.transaction_method)?.name || 'OTHER'),
    amount: Math.abs(numberValue(split.amount)),
    direction: split.transaction_type === 'EXPENSE' ? 'OUT' : 'IN',
    reconciliationStatus: split.reconciliation_status,
    cashImpact: 0,
  }))
  const isExpense =
    category?.type === 'EXPENSE' || tenders.every((tender) => tender.direction === 'OUT')
  const amount = Math.abs(numberValue(row.total_amount)) * (isExpense ? -1 : 1)
  return {
    id: row.id,
    reference: legacyReference(row),
    date: row.work_date,
    time: formatTime(row.created_at, timezone),
    occurredAt: row.created_at,
    name: row.customer_full_name?.trim() || supplier?.name || 'Walk-in',
    category: category?.name || 'Uncategorised',
    method: displayMethod(tenders),
    amount,
    totalAmount: Math.abs(amount),
    amountPaid: Math.abs(amount),
    cashImpact: 0,
    points: 0,
    status: tenders.some((tender) => tender.reconciliationStatus !== 'CLEARED')
      ? 'Pending'
      : 'Imported',
    note: row.remark?.trim() || '',
    supplier: supplier?.name,
    entryAgent: employeeNames.get(row.employee_id) || 'Staff member',
    entryAgentId: row.employee_id,
    sourceLinkId: row.source_link_id,
    tenders,
    isLegacy: true,
  }
}

async function loadLegacyLedger(
  employeeId: string,
  period: PosLedgerPeriod,
  date: string,
): Promise<PosLedgerPayload> {
  const { startDate, endDate } = posLedgerPeriodBounds(date, period)
  const supabase = getServiceSupabaseClient()
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('location_id, locations(id, name, timezone)')
    .eq('id', employeeId)
    .maybeSingle()
  if (employeeError) throw employeeError
  const employeeLocation = employee as unknown as EmployeeLocationRow | null
  const location = firstRelated(employeeLocation?.locations || null)
  if (!employeeLocation?.location_id || !location)
    throw new PosLedgerAccessError('Your employee profile is not assigned to a branch.')
  const { data: branchEmployees, error: branchEmployeesError } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('location_id', employeeLocation.location_id)
  if (branchEmployeesError) throw branchEmployeesError
  const employeeRows = (branchEmployees || []) as BranchEmployeeRow[]
  const employeeIds = employeeRows.map((row) => row.id)
  const employeeNames = new Map(
    employeeRows.map((row) => [row.id, row.full_name?.trim() || 'Staff member']),
  )
  if (employeeIds.length === 0) {
    return {
      items: [],
      summary: summarizePosLedgerItems([]),
      context: {
        branchId: location.id,
        branchName: location.name,
        timezone: location.timezone || 'Europe/London',
        period,
        date,
        loadedAt: new Date().toISOString(),
        source: 'daily_ledger_entries',
        truncated: false,
      },
    }
  }
  const { data, error } = await supabase
    .from('daily_ledger_entries')
    .select(
      `id,work_date,created_at,customer_full_name,remark,source_link_id,total_amount,employee_id,
      accounting_category:accounting_categories(name,type),supplier:supplier_vendors(name),
      daily_payment_splits(amount,transaction_type,reconciliation_status,transaction_method:transaction_methods(name))`,
    )
    .in('employee_id', employeeIds)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(POS_LEDGER_LIMIT + 1)
  if (error) throw error
  const rows = (data || []) as unknown as LegacyLedgerRow[]
  const items = rows
    .slice(0, POS_LEDGER_LIMIT)
    .map((row) => legacyTransaction(row, employeeNames, location.timezone || 'Europe/London'))
  return {
    items,
    summary: summarizePosLedgerItems(items),
    context: {
      branchId: location.id,
      branchName: location.name,
      timezone: location.timezone || 'Europe/London',
      period,
      date,
      loadedAt: new Date().toISOString(),
      source: 'daily_ledger_entries',
      truncated: rows.length > POS_LEDGER_LIMIT,
    },
  }
}

export async function loadPosLedger(
  employeeId: string,
  period: PosLedgerPeriod,
  date: string,
  filters: PosLedgerFilters = {},
  cursor?: string,
): Promise<PosLedgerPayload> {
  const status = await getPosSchemaStatus()
  return hasPosSchemaCapability(status)
    ? loadPosLedgerRows(employeeId, period, date, filters, cursor)
    : loadLegacyLedger(employeeId, period, date)
}
