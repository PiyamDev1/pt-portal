import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PosPaymentMethod,
  PosReconciliationStatus,
  PosTenderDestination,
} from '@/lib/pos/contracts'
import { formatIsoDateInTimezone } from '@/lib/dateFormatter'
import {
  isPosTenderUnreconciled,
  resolvePosTenderReconciliation,
  type PosReconciliationEventSnapshot,
} from '@/lib/pos/reconciliation'
import { posLedgerPeriodBounds } from '@/lib/pos/ledgerServer'

const PAGE_SIZE = 1000
const MAX_PAGES = 100

type PosReconciliationSummaryRow = {
  id: string
  payment_method: PosPaymentMethod
  destination?: PosTenderDestination
  reconciliation_status: PosReconciliationStatus
  external_reference: string | null
  created_at: string
  pos_reconciliation_events: PosReconciliationEventSnapshot[] | null
}

export type PosReconciliationAttentionSummary = {
  available: boolean
  unresolvedCount: number
  failedCount: number
  oldestUnresolvedAt: string | null
  month: string
  branchName: string
}

async function loadTransactionTenders(
  supabase: SupabaseClient,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const rows: PosReconciliationSummaryRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pos_transaction_tenders')
      .select(
        `id,payment_method,destination,reconciliation_status,external_reference,created_at,
        pos_reconciliation_events(status,external_reference,created_at,id),
        pos_transactions!inner(location_id,business_date)`,
      )
      .neq('payment_method', 'CASH')
      .neq('destination', 'SUPPLIER_DIRECT')
      .eq('pos_transactions.location_id', locationId)
      .gte('pos_transactions.business_date', startDate)
      .lte('pos_transactions.business_date', endDate)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    const pageRows = (data || []) as unknown as PosReconciliationSummaryRow[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }

  throw new Error('POS transaction tender summary limit exceeded')
}

async function loadRefundTenders(
  supabase: SupabaseClient,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const rows: PosReconciliationSummaryRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pos_refund_tenders')
      .select(
        `id,payment_method,reconciliation_status,external_reference,created_at,
        pos_reconciliation_events(status,external_reference,created_at,id),
        pos_refunds!inner(location_id,business_date)`,
      )
      .neq('payment_method', 'CASH')
      .eq('pos_refunds.location_id', locationId)
      .gte('pos_refunds.business_date', startDate)
      .lte('pos_refunds.business_date', endDate)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    const pageRows = (data || []) as unknown as PosReconciliationSummaryRow[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }

  throw new Error('POS refund tender summary limit exceeded')
}

/**
 * Reads the current branch's current-month tenders and resolves every row from
 * its latest reconciliation event. It never copies or mutates POS records.
 */
export async function loadPosReconciliationAttentionSummary(
  supabase: SupabaseClient,
  input: {
    locationId: string | null
    branchName: string | null
    timezone: string | null
    generatedAt: string
  },
): Promise<PosReconciliationAttentionSummary> {
  const localDate = formatIsoDateInTimezone(input.generatedAt, input.timezone || 'Europe/London')
  const month = localDate.slice(0, 7)
  const unavailable = {
    available: false,
    unresolvedCount: 0,
    failedCount: 0,
    oldestUnresolvedAt: null,
    month,
    branchName: input.branchName || 'Assigned branch',
  }
  if (!input.locationId) return unavailable

  try {
    const { startDate, endDate } = posLedgerPeriodBounds(localDate, 'month')
    const [transactions, refunds] = await Promise.all([
      loadTransactionTenders(supabase, input.locationId, startDate, endDate),
      loadRefundTenders(supabase, input.locationId, startDate, endDate),
    ])
    const unresolved = [...transactions, ...refunds]
      .map((row) => ({
        row,
        reconciliation: resolvePosTenderReconciliation(row),
      }))
      .filter(({ row, reconciliation }) =>
        isPosTenderUnreconciled({
          reconciliationStatus: reconciliation.status,
          destination: row.destination,
        }),
      )
      .sort((left, right) => left.row.created_at.localeCompare(right.row.created_at))

    return {
      available: true,
      unresolvedCount: unresolved.length,
      failedCount: unresolved.filter(({ reconciliation }) => reconciliation.status === 'FAILED')
        .length,
      oldestUnresolvedAt: unresolved[0]?.row.created_at || null,
      month,
      branchName: input.branchName || 'Assigned branch',
    }
  } catch {
    return unavailable
  }
}
