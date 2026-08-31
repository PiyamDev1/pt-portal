import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession, type StaffSession } from '@/lib/auth/staffSession'
import {
  buildCommissionAnalytics,
  type CommissionAnalytics,
  type CommissionEntryForAnalytics,
} from '@/lib/commissions/analytics'
import {
  COMMISSION_APPLICATION_CAPABILITY_VERSION,
  COMMISSION_PROFILE_CAPABILITY_VERSION,
  COMMISSION_PACKAGE_CAPABILITY_VERSION,
  commissionProfileSchema,
  COMMISSION_SERVICE_LABELS,
  type CommissionProfileInput,
} from '@/lib/commissions/contracts'
import type { Database, Json } from '@/types/supabase'

type CommissionClient = SupabaseClient<Database>

type CommissionManagerAccess =
  | ({ authorized: true; response?: never; supabase: CommissionClient } & StaffSession)
  | { authorized: false; response: NextResponse }

type RelatedName = { name?: string | null }
type RelatedLocation = { id?: string | null; name?: string | null; branch_code?: string | null }
type CommissionEntryRow = Pick<
  Database['public']['Tables']['commission_entries']['Row'],
  | 'id'
  | 'entry_mode'
  | 'entry_kind'
  | 'amount_gbp'
  | 'amount_pay_currency'
  | 'pay_currency'
  | 'exchange_rate_units_per_gbp'
  | 'earning_on'
  | 'created_at'
  | 'supersedes_entry_id'
  | 'source_event_id'
  | 'explanation'
>

export type CommissionPageIdentity = {
  userId: string
  employeeId: string
  fullName: string
  role: string
  location: { id?: string; name?: string; branch_code?: string } | null
}

export type MyCommissionData = {
  schemaReady: boolean
  profile: {
    id: string
    label: string
    effectiveFrom: string
    effectiveTo: string | null
    configuration: CommissionProfileInput | null
    applicationRoutingRecipientName: string | null
  } | null
  scheduledProfile: {
    id: string
    label: string
    effectiveFrom: string
  } | null
  analytics: CommissionAnalytics
  compensation: {
    currency: 'GBP' | 'PKR'
    monthlySalary: number
    currentMonthCommission: number
    currentMonthGrossPay: number
    currentMonthBookGbp: number | null
    unitsPerGbp: number | null
    ratePending: boolean
  }
  openExceptionCount: number
  lastCalculatedAt: string | null
}

export type CommissionAdminEmployee = {
  id: string
  fullName: string
  email: string
  role: string
  location: { id: string; name: string; branchCode: string | null } | null
  profileCount: number
  currentProfileId: string | null
  scheduledProfileId: string | null
  openExceptionCount: number
}

export type CommissionAdminProfile = {
  id: string
  employeeId: string
  label: string
  effectiveFrom: string
  effectiveTo: string | null
  locationId: string | null
  copiedFromProfileId: string | null
  changeReason: string
  createdAt: string
  cancelledAt: string | null
  cancellationReason: string | null
  configuration: CommissionProfileInput | null
}

export type CommissionAdminException = {
  id: string
  employeeId: string | null
  code: string
  status: string
  createdAt: string
  retryCount: number
  serviceCode: string | null
  message: string | null
}

export type CommissionMonthlyExchangeRate = {
  id: string
  currency: 'PKR'
  periodStart: string
  unitsPerGbp: number
  setAt: string
}

export type CommissionSourceModuleStatus = {
  sourceModule: 'ticketing' | 'packages' | 'applications'
  label: string
  pendingEvents: number
  processedEvents: number
  heldEvents: number
  activeEntries: number
  totalGbp: number
  closedRecordsMissingEvent: number
  closedRecordsMissingOwner: number
}

export type CommissionAdminData = {
  schemaReady: boolean
  schemaVersion: number
  mode: string
  packageIntegrationReady: boolean
  applicationIntegrationReady: boolean
  employees: CommissionAdminEmployee[]
  profiles: CommissionAdminProfile[]
  exchangeRates: CommissionMonthlyExchangeRate[]
  sourceModules: CommissionSourceModuleStatus[]
  exceptions: CommissionAdminException[]
  overview: {
    pendingEvents: number
    processedEvents: number
    heldEvents: number
    openExceptions: number
    activeShadowEntries: number
    shadowTotalGbp: number
    incompleteBonusPeriods: number
  }
  lastRun: {
    id: string
    status: string
    startedAt: string
    completedAt: string | null
    sourceEventCount: number
    entryCount: number
    exceptionCount: number
  } | null
}

function commissionClient() {
  return getServiceSupabaseClient() as unknown as CommissionClient
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function londonDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function loadCommissionEntryRows(
  supabase: CommissionClient,
  employeeId: string,
  selection: string,
  earningFrom: string,
) {
  const rows: CommissionEntryRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase
      .from('commission_entries')
      .select(selection)
      .eq('recipient_employee_id', employeeId)
      .gte('earning_on', earningFrom)
      .order('earning_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (result.error) return { data: null, error: result.error }

    const page = (result.data || []) as unknown as CommissionEntryRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return { data: rows, error: null }
}

function jsonObject(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function profileDraft(value: Json | null | undefined): CommissionProfileInput | null {
  const draft = jsonObject(value).draft
  const draftObject = jsonObject(draft as Json | null | undefined)
  const services = jsonObject(draftObject.services as Json | null | undefined)
  const zeroRate = { kind: 'none', value: 0, tiers: [] }
  const compatibleDraft =
    Object.keys(draftObject).length > 0
      ? {
          ...draftObject,
          applicationRouting: draftObject.applicationRouting || {
            mode: 'self',
            recipientEmployeeId: null,
          },
          services: {
            packageSale: zeroRate,
            applicationNadra: zeroRate,
            applicationNadraUrgent: services.applicationNadra || zeroRate,
            applicationPassportPk: zeroRate,
            applicationPassportPkUrgent: services.applicationPassportPk || zeroRate,
            applicationPassportGb: zeroRate,
            applicationVisa: zeroRate,
            ...services,
          },
        }
      : draft
  const parsed = commissionProfileSchema.safeParse(compatibleDraft)
  return parsed.success ? parsed.data : null
}

function isSchemaMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

export async function requireCommissionManager(): Promise<CommissionManagerAccess> {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access

  const supabase = commissionClient()
  const { data, error } = await supabase.rpc('commission_actor_can_manage_2026082901', {
    p_employee_id: access.employee.id,
  })
  if (error) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Commission management is not available' },
        { status: 503 },
      ),
    }
  }
  if (!data) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ...access, authorized: true, supabase }
}

export async function getCommissionPageIdentity(
  access: StaffSession,
): Promise<CommissionPageIdentity> {
  const supabase = commissionClient()
  const { data } = await supabase
    .from('employees')
    .select('location_id, locations(id, name, branch_code)')
    .eq('id', access.employee.id)
    .maybeSingle()
  const related = firstRelated(data?.locations as RelatedLocation | RelatedLocation[] | null)

  return {
    userId: access.user.id,
    employeeId: access.employee.id,
    fullName: access.employee.fullName,
    role: access.employee.role,
    location: related
      ? {
          id: related.id || data?.location_id || undefined,
          name: related.name || undefined,
          branch_code: related.branch_code || undefined,
        }
      : null,
  }
}

export async function loadMyCommissionData(
  employeeId: string,
  now = new Date(),
): Promise<MyCommissionData> {
  const supabase = commissionClient()
  const today = londonDate(now)
  const analyticsNow = new Date(`${today}T12:00:00Z`)
  const reportingYear = Number(today.slice(0, 4))
  const reportingMonthIndex = Number(today.slice(5, 7)) - 1
  const currentPeriodStart = `${today.slice(0, 7)}-01`
  const sixMonthStart = new Date(Date.UTC(reportingYear, reportingMonthIndex - 5, 1))
  const yearStart = new Date(Date.UTC(reportingYear, 0, 1))
  const analyticsFrom = (sixMonthStart < yearStart ? sixMonthStart : yearStart)
    .toISOString()
    .slice(0, 10)
  const schemaResult = await supabase.rpc('commission_schema_status')
  if (schemaResult.error && !isSchemaMissing(schemaResult.error)) throw schemaResult.error
  const profileCapabilityReady =
    numeric(jsonObject(schemaResult.data).version) >= COMMISSION_PROFILE_CAPABILITY_VERSION
  const entrySelection = profileCapabilityReady
    ? 'id, entry_mode, entry_kind, amount_gbp, amount_pay_currency, pay_currency, exchange_rate_units_per_gbp, earning_on, created_at, supersedes_entry_id, source_event_id, explanation'
    : 'id, entry_mode, entry_kind, amount_gbp, earning_on, created_at, supersedes_entry_id, source_event_id, explanation'
  const [profilesResult, entriesResult, exceptionsResult, runsResult, exchangeRateResult] =
    await Promise.all([
      supabase
        .from('employee_commission_profiles')
        .select('id, label, effective_from, effective_to, configuration, created_at')
        .eq('employee_id', employeeId)
        .is('cancelled_at', null)
        .order('effective_from', { ascending: false }),
      loadCommissionEntryRows(supabase, employeeId, entrySelection, analyticsFrom),
      supabase
        .from('commission_exceptions')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .eq('status', 'open'),
      supabase
        .from('commission_calculation_runs')
        .select('completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1),
      profileCapabilityReady
        ? supabase
            .from('commission_monthly_exchange_rates')
            .select('units_per_gbp')
            .eq('currency', 'PKR')
            .eq('period_start', currentPeriodStart)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

  if (profilesResult.error && isSchemaMissing(profilesResult.error)) {
    return {
      schemaReady: false,
      profile: null,
      scheduledProfile: null,
      analytics: buildCommissionAnalytics([], analyticsNow),
      compensation: {
        currency: 'GBP',
        monthlySalary: 0,
        currentMonthCommission: 0,
        currentMonthGrossPay: 0,
        currentMonthBookGbp: 0,
        unitsPerGbp: 1,
        ratePending: false,
      },
      openExceptionCount: 0,
      lastCalculatedAt: null,
    }
  }
  if (profilesResult.error) throw profilesResult.error
  if (entriesResult.error && isSchemaMissing(entriesResult.error)) {
    return {
      schemaReady: false,
      profile: null,
      scheduledProfile: null,
      analytics: buildCommissionAnalytics([], analyticsNow),
      compensation: {
        currency: 'GBP',
        monthlySalary: 0,
        currentMonthCommission: 0,
        currentMonthGrossPay: 0,
        currentMonthBookGbp: 0,
        unitsPerGbp: 1,
        ratePending: false,
      },
      openExceptionCount: 0,
      lastCalculatedAt: null,
    }
  }
  if (entriesResult.error) throw entriesResult.error
  if (exceptionsResult.error) throw exceptionsResult.error
  if (runsResult.error) throw runsResult.error
  if (exchangeRateResult.error) throw exchangeRateResult.error

  const entryRows = (entriesResult.data || []) as unknown as CommissionEntryRow[]
  const sourceIds = Array.from(
    new Set(entryRows.map((entry) => entry.source_event_id).filter((id): id is string => !!id)),
  )
  const sourcePaths = new Map<string, string>()
  const sourcePageSize = 500
  for (let offset = 0; offset < sourceIds.length; offset += sourcePageSize) {
    const { data: sourceEvents, error } = await supabase
      .from('commission_source_events')
      .select('id, source_path')
      .in('id', sourceIds.slice(offset, offset + sourcePageSize))
    if (error) throw error
    for (const source of sourceEvents || []) sourcePaths.set(source.id, source.source_path)
  }

  const entries: CommissionEntryForAnalytics[] = entryRows.map((entry) => {
    const explanation = jsonObject(entry.explanation)
    const serviceCode =
      typeof explanation.serviceCode === 'string'
        ? explanation.serviceCode
        : entry.entry_kind === 'sales_bonus'
          ? 'sales_bonus'
          : null
    return {
      id: entry.id,
      entryMode: entry.entry_mode === 'live' ? 'live' : 'shadow',
      entryKind:
        entry.entry_kind === 'sales_bonus' || entry.entry_kind === 'manual_adjustment'
          ? entry.entry_kind
          : 'ordinary',
      amountGbp: numeric(entry.amount_gbp),
      amountPayCurrency: numeric(entry.amount_pay_currency),
      payCurrency: entry.pay_currency === 'PKR' ? 'PKR' : 'GBP',
      earningOn: entry.earning_on,
      createdAt: entry.created_at,
      supersedesEntryId: entry.supersedes_entry_id,
      serviceCode,
      sourcePath: entry.source_event_id ? sourcePaths.get(entry.source_event_id) || null : null,
      description:
        serviceCode && serviceCode in COMMISSION_SERVICE_LABELS
          ? COMMISSION_SERVICE_LABELS[serviceCode as keyof typeof COMMISSION_SERVICE_LABELS]
          : entry.entry_kind === 'manual_adjustment'
            ? 'Manual adjustment'
            : 'Commission entry',
    }
  })

  const profiles = profilesResult.data || []
  const current = profiles.find(
    (profile) =>
      profile.effective_from <= today &&
      (profile.effective_to === null || profile.effective_to >= today),
  )
  const scheduled = [...profiles]
    .filter((profile) => profile.effective_from > today)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from))[0]
  const currentConfiguration = current ? profileDraft(current.configuration) : null
  const applicationRoutingRecipientId =
    currentConfiguration?.applicationRouting.mode === 'another_employee'
      ? currentConfiguration.applicationRouting.recipientEmployeeId
      : null
  let applicationRoutingRecipientName: string | null = null
  if (applicationRoutingRecipientId) {
    const { data: recipient, error: recipientError } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', applicationRoutingRecipientId)
      .maybeSingle()
    if (recipientError) throw recipientError
    applicationRoutingRecipientName = recipient?.full_name || 'Former staff member'
  }
  const payCurrency = currentConfiguration?.compensation.currency || 'GBP'
  const monthlySalary = currentConfiguration?.compensation.monthlySalary || 0
  const currentMonth = today.slice(0, 7)
  const supersededEntryIds = new Set(
    entryRows
      .map((entry) => entry.supersedes_entry_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  const currentPayEntries = entryRows.filter(
    (entry) =>
      !supersededEntryIds.has(entry.id) &&
      entry.earning_on.startsWith(currentMonth) &&
      (entry.pay_currency === payCurrency || (payCurrency === 'GBP' && !entry.pay_currency)),
  )
  const currentMonthCommission = currentPayEntries.reduce(
    (total, entry) => total + numeric(entry.amount_pay_currency ?? entry.amount_gbp),
    0,
  )
  const unitsPerGbpValue =
    payCurrency === 'GBP'
      ? 1
      : exchangeRateResult.data?.units_per_gbp ||
        currentPayEntries.find((entry) => numeric(entry.exchange_rate_units_per_gbp) > 0)
          ?.exchange_rate_units_per_gbp ||
        null
  const unitsPerGbp = unitsPerGbpValue ? numeric(unitsPerGbpValue) : null
  const currentMonthGrossPay = monthlySalary + currentMonthCommission

  return {
    schemaReady: profileCapabilityReady,
    profile: current
      ? {
          id: current.id,
          label: current.label,
          effectiveFrom: current.effective_from,
          effectiveTo: current.effective_to,
          configuration: currentConfiguration,
          applicationRoutingRecipientName,
        }
      : null,
    scheduledProfile: scheduled
      ? { id: scheduled.id, label: scheduled.label, effectiveFrom: scheduled.effective_from }
      : null,
    analytics: buildCommissionAnalytics(entries, analyticsNow),
    compensation: {
      currency: payCurrency,
      monthlySalary,
      currentMonthCommission: Math.round(currentMonthCommission * 100) / 100,
      currentMonthGrossPay: Math.round(currentMonthGrossPay * 100) / 100,
      currentMonthBookGbp:
        unitsPerGbp && unitsPerGbp > 0
          ? Math.round((currentMonthGrossPay / unitsPerGbp) * 100) / 100
          : null,
      unitsPerGbp,
      ratePending: payCurrency !== 'GBP' && !unitsPerGbp,
    },
    openExceptionCount: exceptionsResult.count || 0,
    lastCalculatedAt: runsResult.data?.[0]?.completed_at || null,
  }
}

const EMPTY_OVERVIEW: CommissionAdminData['overview'] = {
  pendingEvents: 0,
  processedEvents: 0,
  heldEvents: 0,
  openExceptions: 0,
  activeShadowEntries: 0,
  shadowTotalGbp: 0,
  incompleteBonusPeriods: 0,
}

export async function loadCommissionAdminData(
  actorEmployeeId: string,
  suppliedClient?: CommissionClient,
): Promise<CommissionAdminData> {
  const supabase = suppliedClient || commissionClient()
  const schemaResult = await supabase.rpc('commission_schema_status')
  if (schemaResult.error && !isSchemaMissing(schemaResult.error)) throw schemaResult.error
  const schemaStatus = jsonObject(schemaResult.data)
  const schemaVersion = numeric(schemaStatus.version)
  const profileCapabilityReady = schemaVersion >= COMMISSION_PROFILE_CAPABILITY_VERSION

  const profilesResult = await supabase
    .from('employee_commission_profiles')
    .select(
      'id, employee_id, label, effective_from, effective_to, location_id, copied_from_profile_id, configuration, change_reason, created_at, cancelled_at, cancellation_reason',
    )
    .order('effective_from', { ascending: false })
  if (profilesResult.error && isSchemaMissing(profilesResult.error)) {
    return {
      schemaReady: false,
      schemaVersion,
      mode: String(schemaStatus.mode || 'unavailable'),
      employees: [],
      profiles: [],
      exchangeRates: [],
      sourceModules: [],
      packageIntegrationReady: false,
      applicationIntegrationReady: false,
      exceptions: [],
      overview: EMPTY_OVERVIEW,
      lastRun: null,
    }
  }
  if (profilesResult.error) throw profilesResult.error

  const packageIntegrationReady = schemaVersion >= COMMISSION_PACKAGE_CAPABILITY_VERSION
  const applicationIntegrationReady = schemaVersion >= COMMISSION_APPLICATION_CAPABILITY_VERSION
  const [
    employeesResult,
    exceptionsResult,
    overviewResult,
    runsResult,
    exchangeRatesResult,
    sourceModulesResult,
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, email, is_active, roles(name), locations(id, name, branch_code)')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('commission_exceptions')
      .select('id, employee_id, exception_code, status, details, retry_count, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('commission_shadow_overview_2026082901', {
      p_actor_employee_id: actorEmployeeId,
    }),
    supabase
      .from('commission_calculation_runs')
      .select(
        'id, status, started_at, completed_at, source_event_count, entry_count, exception_count',
      )
      .order('started_at', { ascending: false })
      .limit(1),
    profileCapabilityReady
      ? supabase
          .from('commission_monthly_exchange_rates')
          .select('id, currency, period_start, units_per_gbp, created_at')
          .order('period_start', { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], error: null }),
    packageIntegrationReady
      ? supabase.rpc(
          applicationIntegrationReady
            ? 'commission_source_module_overview_2026083005'
            : 'commission_source_module_overview_2026083003',
          {
            p_actor_employee_id: actorEmployeeId,
          },
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  if (employeesResult.error) throw employeesResult.error
  if (exceptionsResult.error) throw exceptionsResult.error
  if (overviewResult.error) throw overviewResult.error
  if (runsResult.error) throw runsResult.error
  if (exchangeRatesResult.error) throw exchangeRatesResult.error
  if (sourceModulesResult.error) throw sourceModulesResult.error

  const today = new Date().toISOString().slice(0, 10)
  const profiles: CommissionAdminProfile[] = (profilesResult.data || [])
    .filter(
      (profile) =>
        !/^\[(?:removed|overwritten)\]/i.test(String(profile.cancellation_reason || '').trim()),
    )
    .map((profile) => ({
      id: profile.id,
      employeeId: profile.employee_id,
      label: profile.label,
      effectiveFrom: profile.effective_from,
      effectiveTo: profile.effective_to,
      locationId: profile.location_id,
      copiedFromProfileId: profile.copied_from_profile_id,
      changeReason: profile.change_reason,
      createdAt: profile.created_at,
      cancelledAt: profile.cancelled_at,
      cancellationReason: profile.cancellation_reason,
      configuration: profileDraft(profile.configuration),
    }))
  const exceptions: CommissionAdminException[] = (exceptionsResult.data || []).map((item) => {
    const details = jsonObject(item.details)
    return {
      id: item.id,
      employeeId: item.employee_id,
      code: item.exception_code,
      status: item.status,
      createdAt: item.created_at,
      retryCount: item.retry_count,
      serviceCode: typeof details.serviceCode === 'string' ? details.serviceCode : null,
      message: typeof details.message === 'string' ? details.message : null,
    }
  })

  const employees: CommissionAdminEmployee[] = (employeesResult.data || []).map((employee) => {
    const role = firstRelated(employee.roles as RelatedName | RelatedName[] | null)
    const location = firstRelated(employee.locations as RelatedLocation | RelatedLocation[] | null)
    const employeeProfiles = profiles.filter((profile) => profile.employeeId === employee.id)
    const employeeExceptions = exceptions.filter((item) => item.employeeId === employee.id)
    const current = employeeProfiles.find(
      (profile) =>
        profile.cancelledAt === null &&
        profile.effectiveFrom <= today &&
        (profile.effectiveTo === null || profile.effectiveTo >= today),
    )
    const scheduled = [...employeeProfiles]
      .filter((profile) => profile.cancelledAt === null && profile.effectiveFrom > today)
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0]
    return {
      id: employee.id,
      fullName: employee.full_name || employee.email || 'Staff member',
      email: employee.email || '',
      role: role?.name || 'Employee',
      location: location?.id
        ? {
            id: location.id,
            name: location.name || 'Branch',
            branchCode: location.branch_code || null,
          }
        : null,
      profileCount: employeeProfiles.length,
      currentProfileId: current?.id || null,
      scheduledProfileId: scheduled?.id || null,
      openExceptionCount: employeeExceptions.length,
    }
  })

  const overview = jsonObject(overviewResult.data)
  const lastRun = runsResult.data?.[0]
  return {
    schemaReady: profileCapabilityReady,
    schemaVersion,
    mode: String(schemaStatus.mode || 'shadow'),
    packageIntegrationReady,
    applicationIntegrationReady,
    employees,
    profiles,
    exchangeRates: (exchangeRatesResult.data || []).map((rate) => ({
      id: rate.id,
      currency: 'PKR',
      periodStart: rate.period_start,
      unitsPerGbp: numeric(rate.units_per_gbp),
      setAt: rate.created_at,
    })),
    sourceModules: (Array.isArray(sourceModulesResult.data) ? sourceModulesResult.data : []).map(
      (module) => {
        const item = jsonObject(module)
        return {
          sourceModule:
            item.sourceModule === 'packages' || item.sourceModule === 'applications'
              ? item.sourceModule
              : 'ticketing',
          label: String(item.label || item.sourceModule || 'Source module'),
          pendingEvents: numeric(item.pendingEvents),
          processedEvents: numeric(item.processedEvents),
          heldEvents: numeric(item.heldEvents),
          activeEntries: numeric(item.activeEntries),
          totalGbp: numeric(item.totalGbp),
          closedRecordsMissingEvent: numeric(item.closedRecordsMissingEvent),
          closedRecordsMissingOwner: numeric(item.closedRecordsMissingOwner),
        }
      },
    ),
    exceptions,
    overview: {
      pendingEvents: numeric(overview.pendingEvents),
      processedEvents: numeric(overview.processedEvents),
      heldEvents: numeric(overview.heldEvents),
      openExceptions: numeric(overview.openExceptions),
      activeShadowEntries: numeric(overview.activeShadowEntries),
      shadowTotalGbp: numeric(overview.shadowTotalGbp),
      incompleteBonusPeriods: numeric(overview.incompleteBonusPeriods),
    },
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.started_at,
          completedAt: lastRun.completed_at,
          sourceEventCount: lastRun.source_event_count,
          entryCount: lastRun.entry_count,
          exceptionCount: lastRun.exception_count,
        }
      : null,
  }
}
