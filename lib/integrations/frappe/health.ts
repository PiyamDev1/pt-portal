import { getSupabaseClient } from '@/lib/supabaseClient'
import { frappePing } from '@/lib/integrations/frappe/client'
import { getFrappeEmployeeProvisioningReadiness } from '@/lib/integrations/frappe/provisioning'

export async function getFrappeIntegrationHealth() {
  const supabase = getSupabaseClient()
  const handoffSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    pingResult,
    employeeProvisioningResult,
    syncStateResult,
    outboxPendingResult,
    outboxDeadLetterResult,
    attendanceOutboxPendingResult,
    attendanceOutboxDeadLetterResult,
    inboxPendingResult,
    conflictOpenResult,
    identityMapResult,
    handoffIssuedResult,
    handoffProblemResult,
    recentHandoffResult,
  ] = await Promise.allSettled([
    frappePing(),
    getFrappeEmployeeProvisioningReadiness(),
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
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('domain', 'attendance')
      .in('status', ['pending', 'processing']),
    supabase
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('domain', 'attendance')
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
    supabase
      .from('frappe_handoff_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'issued')
      .gte('created_at', handoffSince),
    supabase
      .from('frappe_handoff_events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'not_linked', 'unauthorized'])
      .gte('created_at', handoffSince),
    supabase
      .from('frappe_handoff_events')
      .select('id, user_email, target_path, response_mode, client_kind, status, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const pingOk = pingResult.status === 'fulfilled'
  const pingPayload = pingOk ? pingResult.value : null
  const pingError = pingOk ? null : (pingResult.reason instanceof Error ? pingResult.reason.message : String(pingResult.reason))
  const employeeProvisioning = employeeProvisioningResult.status === 'fulfilled'
    ? employeeProvisioningResult.value
    : {
      ready: false,
      error: employeeProvisioningResult.reason instanceof Error
        ? employeeProvisioningResult.reason.message
        : String(employeeProvisioningResult.reason),
    }

  const syncState = syncStateResult.status === 'fulfilled' && !syncStateResult.value.error
    ? syncStateResult.value.data || []
    : []

  const counts = {
    outbox_pending: getExactCount(outboxPendingResult),
    outbox_dead_letter: getExactCount(outboxDeadLetterResult),
    timeclock_attendance_pending: getExactCount(attendanceOutboxPendingResult),
    timeclock_attendance_dead_letter: getExactCount(attendanceOutboxDeadLetterResult),
    inbox_pending: getExactCount(inboxPendingResult),
    conflicts_open: getExactCount(conflictOpenResult),
    identity_map_rows: getExactCount(identityMapResult),
    handoff_issued_24h: getExactCount(handoffIssuedResult),
    handoff_problem_24h: getExactCount(handoffProblemResult),
  }
  const recentHandoffs = recentHandoffResult.status === 'fulfilled' && !recentHandoffResult.value.error
    ? recentHandoffResult.value.data || []
    : []

  const ready = pingOk && employeeProvisioning.ready && counts.identity_map_rows > 0

  return {
    ready,
    ping_ok: pingOk,
    ping: pingPayload,
    ping_error: pingError,
    employee_provisioning_ready: employeeProvisioning.ready,
    employee_provisioning_error: employeeProvisioning.error,
    sync_state: syncState,
    recent_handoffs: recentHandoffs,
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
