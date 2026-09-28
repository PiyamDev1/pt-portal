import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVE_PACKAGE_FOLDER_STATUSES,
  type PackageAttentionFolder,
  type PackageAttentionQuote,
  type PackageAttentionSummary,
  summarizePackageAttention,
} from '@/lib/packages/attentionSummary'

function unavailableSummary(): PackageAttentionSummary {
  return {
    available: false,
    attentionCount: 0,
    packageCount: 0,
    overduePackageCount: 0,
    criticalPackageCount: 0,
    highRiskPackageCount: 0,
    selectedQuoteCount: 0,
    expiredQuoteCount: 0,
    oldestAttentionAt: null,
  }
}

function completeResult<T>(result: { data: T[] | null; error: unknown; count: number | null }) {
  return !result.error && result.count !== null && (result.data || []).length === result.count
}

/** Reads the same RLS-scoped signals shown in the Packages Action centre. */
export async function loadPackageAttentionSummary(
  supabase: SupabaseClient,
  generatedAt: string,
): Promise<PackageAttentionSummary> {
  try {
    const [folders, selectedQuotes, expiredQuotes, groupedQuotes] = await Promise.all([
      supabase
        .from('travel_packages')
        .select('id,status,risk_level,next_action_due_at,created_at,updated_at', {
          count: 'exact',
        })
        .in('status', ACTIVE_PACKAGE_FOLDER_STATUSES),
      supabase
        .from('travel_package_quotes')
        .select('id,status,selected_at,converted_package_id,expires_at,created_at,updated_at', {
          count: 'exact',
        })
        .neq('status', 'archived')
        .not('selected_at', 'is', null)
        .is('converted_package_id', null),
      supabase
        .from('travel_package_quotes')
        .select('id,status,selected_at,converted_package_id,expires_at,created_at,updated_at', {
          count: 'exact',
        })
        .neq('status', 'archived')
        .is('selected_at', null)
        .is('converted_package_id', null)
        .lte('expires_at', generatedAt),
      supabase
        .from('travel_package_group_members')
        .select('quote_id', { count: 'exact' })
        .not('quote_id', 'is', null),
    ])

    if (
      !completeResult(folders) ||
      !completeResult(selectedQuotes) ||
      !completeResult(expiredQuotes) ||
      !completeResult(groupedQuotes)
    ) {
      return unavailableSummary()
    }

    const quotes = [...(selectedQuotes.data || []), ...(expiredQuotes.data || [])]
    const groupedQuoteIds = (groupedQuotes.data || [])
      .map((row) => (row as { quote_id?: string | null }).quote_id)
      .filter((id): id is string => Boolean(id))

    return summarizePackageAttention({
      folders: (folders.data || []) as unknown as PackageAttentionFolder[],
      quotes: quotes as unknown as PackageAttentionQuote[],
      groupedQuoteIds,
      generatedAt,
    })
  } catch {
    return unavailableSummary()
  }
}
