import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

type IntegrationProblemRow = { created_at: string | null }
type IntegrationSyncStateRow = {
  domain: string
  health_status: string
  updated_at: string | null
}

export type FrappeAttentionSummary = {
  available: boolean
  outboxDeadLetterCount: number
  failedInboxCount: number
  openConflictCount: number
  failedDomainCount: number
  degradedDomainCount: number
  oldestProblemAt: string | null
}

function unavailableSummary(): FrappeAttentionSummary {
  return {
    available: false,
    outboxDeadLetterCount: 0,
    failedInboxCount: 0,
    openConflictCount: 0,
    failedDomainCount: 0,
    degradedDomainCount: 0,
    oldestProblemAt: null,
  }
}

function firstDate(data: unknown, field: 'created_at' | 'received_at' = 'created_at') {
  if (!Array.isArray(data)) return null
  const value = (data[0] as Record<string, unknown> | undefined)?.[field]
  return typeof value === 'string' ? value : null
}

/**
 * Reads durable integration failures from Supabase without pinging Frappe or
 * triggering sync work. This is intentionally narrower than the maintenance
 * health endpoint so the main dashboard stays fast and side-effect free.
 */
export async function loadFrappeAttentionSummary(
  supabase: SupabaseClient,
): Promise<FrappeAttentionSummary> {
  try {
    const [outbox, inbox, conflicts, syncState] = await Promise.all([
      supabase
        .from('integration_outbox')
        .select('created_at', { count: 'exact' })
        .eq('status', 'dead_letter')
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('integration_inbox')
        .select('received_at', { count: 'exact' })
        .eq('source', 'frappe')
        .in('status', ['failed', 'dead_letter'])
        .order('received_at', { ascending: true })
        .limit(1),
      supabase
        .from('integration_conflicts')
        .select('created_at', { count: 'exact' })
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('integration_sync_state')
        .select('domain, health_status, updated_at')
        .in('health_status', ['degraded', 'failed'])
        .order('updated_at', { ascending: true }),
    ])

    if (
      outbox.error ||
      inbox.error ||
      conflicts.error ||
      syncState.error ||
      outbox.count === null ||
      inbox.count === null ||
      conflicts.count === null
    ) {
      return unavailableSummary()
    }

    const syncRows = (syncState.data || []) as unknown as IntegrationSyncStateRow[]
    const problemDates = [
      firstDate(outbox.data),
      firstDate(inbox.data, 'received_at'),
      firstDate(conflicts.data),
      ...syncRows.map((row) => row.updated_at),
    ]
      .filter((value): value is string => Boolean(value))
      .filter((value) => Number.isFinite(new Date(value).getTime()))
      .sort()

    return {
      available: true,
      outboxDeadLetterCount: outbox.count,
      failedInboxCount: inbox.count,
      openConflictCount: conflicts.count,
      failedDomainCount: syncRows.filter((row) => row.health_status === 'failed').length,
      degradedDomainCount: syncRows.filter((row) => row.health_status === 'degraded').length,
      oldestProblemAt: problemDates[0] || null,
    }
  } catch {
    return unavailableSummary()
  }
}
