import { getSupabaseClient } from '@/lib/supabaseClient'
import { frappePing } from '@/lib/integrations/frappe/client'

export async function getFrappeIntegrationHealth() {
  const supabase = getSupabaseClient()

  const [
    pingResult,
    syncStateResult,
    outboxPendingResult,
    outboxDeadLetterResult,
    inboxPendingResult,
    conflictOpenResult,
    identityMapResult,
  ] = await Promise.allSettled([
    frappePing(),
    supabase
      .from('integration_sync_state')
      .select('domain, last_pull_at, last_push_at, health_status, details')
      .order('domain', { ascending: true }),
    supabase
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']),
    supabase
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead_letter'),
    supabase
      .from('integration_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('integration_conflicts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('integration_identity_map')
      .select('id', { count: 'exact', head: true }),
  ])

  const pingOk = pingResult.status === 'fulfilled'
  const pingPayload = pingOk ? pingResult.value : null
  const pingError = pingOk ? null : (pingResult.reason instanceof Error ? pingResult.reason.message : String(pingResult.reason))

  const syncState = syncStateResult.status === 'fulfilled' && !syncStateResult.value.error
    ? syncStateResult.value.data || []
    : []

  const counts = {
    outbox_pending: getExactCount(outboxPendingResult),
    outbox_dead_letter: getExactCount(outboxDeadLetterResult),
    inbox_pending: getExactCount(inboxPendingResult),
    conflicts_open: getExactCount(conflictOpenResult),
    identity_map_rows: getExactCount(identityMapResult),
  }

  const ready = pingOk && counts.identity_map_rows > 0

  return {
    ready,
    ping_ok: pingOk,
    ping: pingPayload,
    ping_error: pingError,
    sync_state: syncState,
    counts,
  }
}

function getExactCount(
  result: PromiseSettledResult<{ count: number | null; error?: { message?: string } | null }>
) {
  if (result.status !== 'fulfilled') return 0
  if (result.value.error) return 0
  return Number(result.value.count || 0)
}
