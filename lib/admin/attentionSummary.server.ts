import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type AdminAttentionSummary = {
  approvalAvailable: boolean
  approvalScope: 'all' | 'own'
  pendingApprovalCount: number
  oldestPendingApprovalAt: string | null
  issueReportsIncluded: boolean
  issueReportsAvailable: boolean
  openIssueReportCount: number
  criticalIssueReportCount: number
  oldestOpenIssueReportAt: string | null
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

async function loadApprovalSummary(
  supabase: SupabaseClient,
  employeeId: string,
  ownRequestsOnly: boolean,
) {
  try {
    let query = supabase
      .from('staff_admin_approval_requests')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')

    if (ownRequestsOnly) query = query.eq('requested_by', employeeId)

    const { data, error, count } = await query.order('created_at', { ascending: true }).limit(1)
    const first = (data || [])[0] as { created_at?: string | null } | undefined
    return {
      available: !error && count !== null,
      count: !error && count !== null ? count : 0,
      oldestAt: !error ? first?.created_at || null : null,
    }
  } catch {
    return { available: false, count: 0, oldestAt: null }
  }
}

async function loadIssueReportSummary(supabase: SupabaseClient) {
  try {
    const [openReports, criticalReports] = await Promise.all([
      supabase
        .from('issue_reports')
        .select('created_at', { count: 'exact' })
        .in('status', ['new', 'investigating'])
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('issue_reports')
        .select('id', { count: 'exact', head: true })
        .in('status', ['new', 'investigating'])
        .eq('severity', 'critical'),
    ])
    const first = (openReports.data || [])[0] as { created_at?: string | null } | undefined
    const available =
      !openReports.error &&
      openReports.count !== null &&
      !criticalReports.error &&
      criticalReports.count !== null

    return {
      available,
      count: available ? openReports.count || 0 : 0,
      criticalCount: available ? criticalReports.count || 0 : 0,
      oldestAt: available ? first?.created_at || null : null,
    }
  } catch {
    return { available: false, count: 0, criticalCount: 0, oldestAt: null }
  }
}

/** Reads durable Admin queues without executing review or maintenance actions. */
export async function loadAdminAttentionSummary(
  supabase: SupabaseClient,
  input: { employeeId: string; roleName: string },
): Promise<AdminAttentionSummary> {
  const role = normalizeRole(input.roleName)
  const canAccessAdmin = ['admin', 'master admin', 'super admin', 'maintenance admin'].includes(
    role,
  )
  if (!canAccessAdmin) {
    return {
      approvalAvailable: true,
      approvalScope: 'own',
      pendingApprovalCount: 0,
      oldestPendingApprovalAt: null,
      issueReportsIncluded: false,
      issueReportsAvailable: true,
      openIssueReportCount: 0,
      criticalIssueReportCount: 0,
      oldestOpenIssueReportAt: null,
    }
  }

  const ownRequestsOnly = role === 'maintenance admin'
  const includeIssueReports = role === 'master admin' || role === 'super admin'
  const [approvals, issueReports] = await Promise.all([
    loadApprovalSummary(supabase, input.employeeId, ownRequestsOnly),
    includeIssueReports
      ? loadIssueReportSummary(supabase)
      : Promise.resolve({ available: true, count: 0, criticalCount: 0, oldestAt: null }),
  ])

  return {
    approvalAvailable: approvals.available,
    approvalScope: ownRequestsOnly ? 'own' : 'all',
    pendingApprovalCount: approvals.count,
    oldestPendingApprovalAt: approvals.oldestAt,
    issueReportsIncluded: includeIssueReports,
    issueReportsAvailable: issueReports.available,
    openIssueReportCount: issueReports.count,
    criticalIssueReportCount: issueReports.criticalCount,
    oldestOpenIssueReportAt: issueReports.oldestAt,
  }
}
