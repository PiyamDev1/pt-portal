import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAccountingAccess, type AccountingAccessResult } from '@/lib/accounting/access'
import { ACCOUNTING_PRIVATE_RESPONSE } from '@/lib/accounting/api'
import {
  branchTotals,
  carryBranchLedger,
  carryCompanyLedger,
  emptyBranchLedger,
  emptyCompanyLedger,
  previousMonth,
  type AccountingLedgerResponse,
  type BranchLedgerPayload,
  type CompanyLedgerPayload,
  type LedgerBranch,
  type LedgerItem,
  type LedgerSheet,
} from '@/lib/accounting/ledger'
import {
  loadBranchModuleResults,
  moduleResultsToLedgerItems,
  moduleResultWarnings,
} from '@/lib/accounting/ledgerSources'

export const dynamic = 'force-dynamic'

const monthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
const moneySchema = z.number().finite().min(-999_999_999).max(999_999_999)
const nonNegativeMoneySchema = moneySchema.min(0)
const identifierSchema = z.string().trim().min(1).max(180)
const nameSchema = z.string().trim().min(1).max(120)

const manualItemSchema = z
  .object({
    id: identifierSchema,
    label: nameSchema,
    group: nameSchema,
    amount: nonNegativeMoneySchema,
    kind: z.enum(['income', 'expense']),
    carriedFrom: monthSchema.optional(),
  })
  .strict()

const sourceItemSchema = manualItemSchema
  .extend({ sourceKey: z.enum(['ticketing', 'packages', 'pos']) })
  .strict()

const branchPayloadSchema = z
  .object({
    formatVersion: z.literal(1),
    incomeGroups: z.array(nameSchema).min(1).max(50),
    expenseGroups: z.array(nameSchema).min(1).max(50),
    items: z.array(manualItemSchema).max(2_000),
    cashStart: moneySchema,
    cashEnd: moneySchema,
    profitStart: moneySchema,
    profitEnd: moneySchema,
    sourceSnapshot: z.array(sourceItemSchema).max(20),
  })
  .strict()

const namedBalanceSchema = z
  .object({
    id: identifierSchema,
    name: nameSchema,
    start: moneySchema,
    end: moneySchema,
    carriedFrom: monthSchema.optional(),
  })
  .strict()

const companyPayloadSchema = z
  .object({
    formatVersion: z.literal(1),
    lmsStart: moneySchema,
    lmsEnd: moneySchema,
    suppliers: z.array(namedBalanceSchema).max(500),
    banks: z.array(namedBalanceSchema).max(100),
  })
  .strict()

const getQuerySchema = z
  .object({
    month: monthSchema,
    locationId: z.string().uuid().optional(),
  })
  .strict()

const saveSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('branch'),
      month: monthSchema,
      locationId: z.string().uuid(),
      revision: z.number().int().min(0),
      finalize: z.boolean().default(false),
      payload: branchPayloadSchema,
    })
    .strict(),
  z
    .object({
      scope: z.literal('company'),
      month: monthSchema,
      revision: z.number().int().min(0),
      finalize: z.boolean().default(false),
      payload: companyPayloadSchema,
    })
    .strict(),
])

type SheetRow = {
  id: string
  scope: 'BRANCH' | 'COMPANY'
  location_id: string | null
  month_start: string
  status: 'OPEN' | 'FINALISED'
  payload: unknown
  revision: number | string
  updated_at: string
}

type AccountingSupabase = Extract<AccountingAccessResult, { authorized: true }>['supabase']

function firstDay(month: string) {
  return `${month}-01`
}

function databaseFailure(error: unknown, fallback: string) {
  const code = String((error as { code?: string } | null)?.code || '')
  if (code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205') {
    return apiError(
      'The live Branch Ledger database update has not been applied yet.',
      503,
      { migration: '20260927181930_accounting_branch_ledger_live.sql' },
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  }
  return apiError(fallback, 500, {}, ACCOUNTING_PRIVATE_RESPONSE)
}

function branchPayload(value: unknown): BranchLedgerPayload | null {
  const parsed = branchPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function companyPayload(value: unknown): CompanyLedgerPayload | null {
  const parsed = companyPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function sheetResponse<T>(
  row: SheetRow | undefined,
  payload: T,
  carriedFrom: string | null = null,
): LedgerSheet<T> {
  return {
    id: row?.id || null,
    revision: Number(row?.revision || 0),
    status: row?.status === 'FINALISED' ? 'finalised' : 'open',
    payload,
    updatedAt: row?.updated_at || null,
    carriedFrom,
  }
}

function resolveBranchSheet(
  locationId: string,
  currentRows: SheetRow[],
  previousRows: SheetRow[],
  previousPeriod: string,
) {
  const current = currentRows.find(
    (row) => row.scope === 'BRANCH' && row.location_id === locationId,
  )
  if (current) {
    const payload = branchPayload(current.payload)
    if (!payload) throw new Error('INVALID_LEDGER_PAYLOAD')
    return sheetResponse(current, payload)
  }
  const previous = previousRows.find(
    (row) => row.scope === 'BRANCH' && row.location_id === locationId && row.status === 'FINALISED',
  )
  const previousPayload = previous ? branchPayload(previous.payload) : null
  return sheetResponse(
    undefined,
    previousPayload ? carryBranchLedger(previousPayload, previousPeriod) : emptyBranchLedger(),
    previousPayload ? previousPeriod : null,
  )
}

function resolveCompanySheet(
  currentRows: SheetRow[],
  previousRows: SheetRow[],
  previousPeriod: string,
) {
  const current = currentRows.find((row) => row.scope === 'COMPANY')
  if (current) {
    const payload = companyPayload(current.payload)
    if (!payload) throw new Error('INVALID_LEDGER_PAYLOAD')
    return sheetResponse(current, payload)
  }
  const previous = previousRows.find((row) => row.scope === 'COMPANY' && row.status === 'FINALISED')
  const previousPayload = previous ? companyPayload(previous.payload) : null
  return sheetResponse(
    undefined,
    previousPayload ? carryCompanyLedger(previousPayload, previousPeriod) : emptyCompanyLedger(),
    previousPayload ? previousPeriod : null,
  )
}

async function ledgerReady(supabase: AccountingSupabase) {
  const { data, error } = await supabase.rpc('accounting_ledger_schema_status')
  if (error) return { ready: false, error }
  const status = data as { ready?: boolean; version?: string } | null
  const ready = status?.ready === true && status.version === '2026092701'
  return { ready, error: ready ? null : { code: '42883' } }
}

export async function GET(request: Request) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const parsed = getQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) {
    return apiError('Choose a valid branch and month.', 400, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const capability = await ledgerReady(access.supabase)
  if (!capability.ready) {
    return databaseFailure(capability.error, 'The live Branch Ledger is not ready.')
  }

  const branchesResult = await access.supabase
    .from('locations')
    .select('id, name, branch_code')
    .order('name', { ascending: true })
    .limit(500)
  if (branchesResult.error) {
    return databaseFailure(branchesResult.error, 'Unable to load live branches.')
  }

  const branches = (
    (branchesResult.data || []) as Array<{
      id: string
      name: string
      branch_code: string | null
    }>
  ).map<LedgerBranch>((branch) => ({
    id: branch.id,
    name: branch.name,
    branchCode: branch.branch_code,
  }))
  if (branches.length === 0) {
    return apiError('No branches are configured yet.', 404, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const selectedBranch = parsed.data.locationId
    ? branches.find((branch) => branch.id === parsed.data.locationId)
    : branches[0]
  if (!selectedBranch) {
    return apiError('The selected branch no longer exists.', 404, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const priorMonth = previousMonth(parsed.data.month)
  const [sheetResult, sourceResults] = await Promise.all([
    access.supabase
      .from('accounting_ledger_sheets')
      .select('id, scope, location_id, month_start, status, payload, revision, updated_at')
      .in('month_start', [firstDay(parsed.data.month), firstDay(priorMonth)]),
    loadBranchModuleResults(
      access.supabase,
      branches.map((branch) => branch.id),
      parsed.data.month,
    ),
  ])
  if (sheetResult.error) {
    return databaseFailure(sheetResult.error, 'Unable to load the Branch Ledger.')
  }

  const rows = (sheetResult.data || []) as SheetRow[]
  const currentRows = rows.filter((row) => row.month_start === firstDay(parsed.data.month))
  const previousRows = rows.filter((row) => row.month_start === firstDay(priorMonth))

  try {
    const resolvedBranches = new Map(
      branches.map((branch) => [
        branch.id,
        resolveBranchSheet(branch.id, currentRows, previousRows, priorMonth),
      ]),
    )
    const selectedSheet = resolvedBranches.get(selectedBranch.id)
    if (!selectedSheet) throw new Error('MISSING_SELECTED_SHEET')

    const selectedSources = sourceResults.get(selectedBranch.id) || []
    const sourceItems =
      selectedSheet.status === 'finalised'
        ? selectedSheet.payload.sourceSnapshot
        : moduleResultsToLedgerItems(parsed.data.month, selectedSources)

    const branchSummaries = branches.map((branch) => {
      const sheet = resolvedBranches.get(branch.id)!
      const branchSourceItems =
        sheet.status === 'finalised'
          ? sheet.payload.sourceSnapshot
          : moduleResultsToLedgerItems(parsed.data.month, sourceResults.get(branch.id) || [])
      const totals = branchTotals(sheet.payload, branchSourceItems)
      return {
        branch,
        income: totals.income,
        expenses: totals.expenses,
        net: totals.net,
        cashStart: sheet.payload.cashStart,
        cashEnd: sheet.payload.cashEnd,
        profitStart: sheet.payload.profitStart,
        profitEnd: totals.profitEnd,
        status: sheet.status,
      }
    })

    const response: AccountingLedgerResponse = {
      month: parsed.data.month,
      branches,
      selectedBranch,
      branchSheet: selectedSheet,
      companySheet: resolveCompanySheet(currentRows, previousRows, priorMonth),
      sourceItems,
      sourceWarnings:
        selectedSheet.status === 'finalised' ? [] : moduleResultWarnings(selectedSources),
      branchSummaries,
    }
    return apiOk(response, ACCOUNTING_PRIVATE_RESPONSE)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_LEDGER_PAYLOAD') {
      return apiError(
        'A saved ledger sheet contains invalid data and needs review.',
        500,
        {},
        ACCOUNTING_PRIVATE_RESPONSE,
      )
    }
    throw error
  }
}

export async function POST(request: Request) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const parsed = saveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError('The ledger changes are invalid.', 400, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const capability = await ledgerReady(access.supabase)
  if (!capability.ready) {
    return databaseFailure(capability.error, 'The live Branch Ledger is not ready.')
  }

  const input = parsed.data
  if (input.scope === 'branch') {
    const locationResult = await access.supabase
      .from('locations')
      .select('id')
      .eq('id', input.locationId)
      .maybeSingle()
    if (locationResult.error) {
      return databaseFailure(locationResult.error, 'Unable to verify the selected branch.')
    }
    if (!locationResult.data) {
      return apiError('The selected branch no longer exists.', 404, {}, ACCOUNTING_PRIVATE_RESPONSE)
    }
  }

  let payload: BranchLedgerPayload | CompanyLedgerPayload = input.payload
  if (input.scope === 'branch') {
    const sources = await loadBranchModuleResults(access.supabase, [input.locationId], input.month)
    const branchSources = sources.get(input.locationId) || []
    const warnings = moduleResultWarnings(branchSources)
    if (input.finalize && warnings.length > 0) {
      return apiError(
        'All module results must be available before this branch month can be finalised.',
        503,
        { warnings },
        ACCOUNTING_PRIVATE_RESPONSE,
      )
    }
    const sourceSnapshot = input.finalize
      ? moduleResultsToLedgerItems(input.month, branchSources)
      : []
    const totals = branchTotals(
      input.payload,
      sourceSnapshot.length
        ? sourceSnapshot
        : moduleResultsToLedgerItems(input.month, branchSources),
    )
    payload = {
      ...input.payload,
      profitEnd: totals.profitEnd,
      sourceSnapshot,
    }
  }

  const scope = input.scope === 'branch' ? 'BRANCH' : 'COMPANY'
  let existingQuery = access.supabase
    .from('accounting_ledger_sheets')
    .select('id, status, revision')
    .eq('scope', scope)
    .eq('month_start', firstDay(input.month))
  existingQuery =
    input.scope === 'branch'
      ? existingQuery.eq('location_id', input.locationId)
      : existingQuery.is('location_id', null)
  const existingResult = await existingQuery.maybeSingle()
  if (existingResult.error) {
    return databaseFailure(existingResult.error, 'Unable to check the current ledger revision.')
  }

  const existing = existingResult.data as {
    id: string
    status: 'OPEN' | 'FINALISED'
    revision: number | string
  } | null
  if (existing?.status === 'FINALISED') {
    return apiError(
      'This ledger month is finalised and cannot be changed.',
      409,
      {},
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  }
  if (Number(existing?.revision || 0) !== input.revision) {
    return apiError(
      'This ledger changed in another session. Refresh before saving again.',
      409,
      { currentRevision: Number(existing?.revision || 0) },
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  }

  const status = input.finalize ? 'FINALISED' : 'OPEN'
  const finalisedAt = input.finalize ? new Date().toISOString() : null
  const rowValues = {
    payload,
    status,
    updated_by_employee_id: access.employee.id,
    finalised_at: finalisedAt,
    finalised_by_employee_id: input.finalize ? access.employee.id : null,
  }

  const saveResult = existing
    ? await access.supabase
        .from('accounting_ledger_sheets')
        .update(rowValues)
        .eq('id', existing.id)
        .eq('revision', input.revision)
        .select('id, scope, location_id, month_start, status, payload, revision, updated_at')
        .maybeSingle()
    : await access.supabase
        .from('accounting_ledger_sheets')
        .insert({
          ...rowValues,
          scope,
          location_id: input.scope === 'branch' ? input.locationId : null,
          month_start: firstDay(input.month),
          created_by_employee_id: access.employee.id,
        })
        .select('id, scope, location_id, month_start, status, payload, revision, updated_at')
        .maybeSingle()

  if (saveResult.error) {
    const code = String(saveResult.error.code || '')
    const hint = String(saveResult.error.hint || '')
    if (code === '23505' || code === '40001' || code === '55P03') {
      return apiError(
        'This ledger changed in another session. Refresh before saving again.',
        409,
        {},
        ACCOUNTING_PRIVATE_RESPONSE,
      )
    }
    if (code === '55000' && hint === 'ACCOUNTING_LEDGER_FINALISED') {
      return apiError(
        'This ledger month is finalised and cannot be changed.',
        409,
        {},
        ACCOUNTING_PRIVATE_RESPONSE,
      )
    }
    return databaseFailure(saveResult.error, 'Unable to save the ledger changes.')
  }
  if (!saveResult.data) {
    return apiError(
      'This ledger changed in another session. Refresh before saving again.',
      409,
      {},
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  }

  const saved = saveResult.data as SheetRow
  return apiOk(
    {
      sheet: sheetResponse(
        saved,
        input.scope === 'branch'
          ? branchPayload(saved.payload) || emptyBranchLedger()
          : companyPayload(saved.payload) || emptyCompanyLedger(),
      ),
    },
    ACCOUNTING_PRIVATE_RESPONSE,
  )
}
