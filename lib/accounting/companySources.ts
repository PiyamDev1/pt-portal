import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyLmsLiveSummary } from '@/lib/accounting/ledger'

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
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
