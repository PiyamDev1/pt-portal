import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CompanyLmsLiveSummary,
  CompanySupplierBalance,
  CompanySupplierLiveSummary,
} from '@/lib/accounting/ledger'

const PAGE_SIZE = 1000
const MAX_PAGES = 100

type RelatedName = { name?: string | null }

type SupplierProfileRow = {
  supplier_vendor_id: string
  is_active?: boolean | null
  settlement_mode?: string | null
  supplier_vendors?: RelatedName | RelatedName[] | null
}

type SupplierBalanceEntryRow = {
  supplier_vendor_id: string
  location_id: string
  balance_delta: number | string | null
  supplier_vendors?: RelatedName | RelatedName[] | null
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function relatedName(value: RelatedName | RelatedName[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name
}

function unavailableSummary(): CompanyLmsLiveSummary {
  return {
    available: false,
    totalOutstanding: 0,
    activeAccounts: 0,
    overdueAccounts: 0,
    dueSoonAccounts: 0,
    totalAccounts: 0,
    loadedAt: new Date().toISOString(),
    sourcePath: '/dashboard/lms',
    warning: 'The live LMS company summary could not be loaded.',
  }
}

export async function loadCompanyLmsLiveSummary(
  supabase: SupabaseClient,
): Promise<CompanyLmsLiveSummary> {
  const { data, error } = await supabase.rpc('lms_list_accounts', {
    p_filter: 'all',
    p_account_id: null,
    p_page: 1,
    p_limit: 1,
  })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return unavailableSummary()
  }

  const stats = (data as { stats?: unknown }).stats
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return unavailableSummary()
  }
  const values = stats as Record<string, unknown>

  return {
    available: true,
    totalOutstanding: numberValue(values.totalOutstanding),
    activeAccounts: numberValue(values.activeAccounts),
    overdueAccounts: numberValue(values.overdueAccounts),
    dueSoonAccounts: numberValue(values.dueSoonAccounts),
    totalAccounts: numberValue(values.totalAccounts),
    loadedAt: new Date().toISOString(),
    sourcePath: '/dashboard/lms',
  }
}

function unavailableSupplierSummary(loadedAt: string): CompanySupplierLiveSummary {
  return {
    available: false,
    netBalance: 0,
    heldBalance: 0,
    amountDue: 0,
    suppliersWithBalance: 0,
    depositAccountCount: 0,
    locationsWithActivity: 0,
    suppliers: [],
    loadedAt,
    sourcePath: '/dashboard/pos',
    warning: 'The live company-wide supplier balance summary could not be loaded.',
  }
}

async function loadSupplierProfiles(supabase: SupabaseClient) {
  const rows: SupplierProfileRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pos_supplier_profiles')
      .select('supplier_vendor_id, is_active, settlement_mode, supplier_vendors(name)')
      .order('created_at', { ascending: true })
      .order('supplier_vendor_id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    const pageRows = (data || []) as unknown as SupplierProfileRow[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }

  throw new Error('Supplier profile limit exceeded')
}

async function loadSupplierBalanceEntries(supabase: SupabaseClient) {
  const rows: SupplierBalanceEntryRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pos_supplier_balance_entries')
      .select('id, supplier_vendor_id, location_id, balance_delta, supplier_vendors(name)')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
    if (error) throw error

    const pageRows = (data || []) as unknown as SupplierBalanceEntryRow[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }

  throw new Error('Supplier balance entry limit exceeded')
}

/**
 * Aggregates POS supplier deposits across every branch. The result is a live
 * company position and never replaces the accountant's monthly control rows.
 */
export async function loadCompanySupplierLiveSummary(
  supabase: SupabaseClient,
  loadedAt = new Date().toISOString(),
): Promise<CompanySupplierLiveSummary> {
  try {
    const [profiles, entries] = await Promise.all([
      loadSupplierProfiles(supabase),
      loadSupplierBalanceEntries(supabase),
    ])
    const profileBySupplier = new Map(
      profiles.map((profile) => [profile.supplier_vendor_id, profile]),
    )
    const balances = new Map<
      string,
      { balance: number; locations: Set<string>; fallbackName: string | null }
    >()

    for (const entry of entries) {
      const current = balances.get(entry.supplier_vendor_id) || {
        balance: 0,
        locations: new Set<string>(),
        fallbackName: null,
      }
      current.balance += numberValue(entry.balance_delta)
      current.locations.add(entry.location_id)
      current.fallbackName ||= relatedName(entry.supplier_vendors) || null
      balances.set(entry.supplier_vendor_id, current)
    }

    const supplierIds = new Set([...profileBySupplier.keys(), ...balances.keys()])
    const suppliers: CompanySupplierBalance[] = Array.from(supplierIds).flatMap((supplierId) => {
      const profile = profileBySupplier.get(supplierId)
      const entry = balances.get(supplierId)
      const balance = roundMoney(entry?.balance || 0)
      const settlementMode =
        profile?.settlement_mode === 'DEPOSIT_ACCOUNT' ||
        profile?.settlement_mode === 'PAY_ON_DEMAND'
          ? profile.settlement_mode
          : 'UNKNOWN'
      const isActive = profile ? profile.is_active !== false : false
      if (balance === 0 && (!isActive || settlementMode !== 'DEPOSIT_ACCOUNT')) return []

      return [
        {
          id: supplierId,
          name: relatedName(profile?.supplier_vendors) || entry?.fallbackName || 'Unknown supplier',
          balance,
          locationCount: entry?.locations.size || 0,
          settlementMode,
          isActive,
        },
      ]
    })
    suppliers.sort(
      (left, right) =>
        Math.abs(right.balance) - Math.abs(left.balance) || left.name.localeCompare(right.name),
    )

    const netBalance = roundMoney(
      Array.from(balances.values()).reduce((sum, row) => sum + row.balance, 0),
    )
    const heldBalance = roundMoney(
      Array.from(balances.values()).reduce((sum, row) => sum + Math.max(0, row.balance), 0),
    )
    const amountDue = roundMoney(
      Array.from(balances.values()).reduce(
        (sum, row) => sum + Math.abs(Math.min(0, row.balance)),
        0,
      ),
    )
    const activeLocations = new Set(entries.map((entry) => entry.location_id))

    return {
      available: true,
      netBalance,
      heldBalance,
      amountDue,
      suppliersWithBalance: suppliers.filter((supplier) => supplier.balance !== 0).length,
      depositAccountCount: profiles.filter(
        (profile) => profile.is_active !== false && profile.settlement_mode === 'DEPOSIT_ACCOUNT',
      ).length,
      locationsWithActivity: activeLocations.size,
      suppliers,
      loadedAt,
      sourcePath: '/dashboard/pos',
    }
  } catch {
    return unavailableSupplierSummary(loadedAt)
  }
}
