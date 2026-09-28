import { describe, expect, it, vi } from 'vitest'
import { loadAdminAttentionSummary } from '@/lib/admin/attentionSummary.server'

type QueryResult = { data: unknown[] | null; error: unknown; count: number | null }

function query(result: QueryResult) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.in.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

describe('Admin Attention Centre summary', () => {
  it('loads all pending approvals and unresolved issue reports for Master Admin', async () => {
    const approvals = query({
      data: [{ created_at: '2026-09-20T09:00:00.000Z' }],
      error: null,
      count: 2,
    })
    const openReports = query({
      data: [{ created_at: '2026-09-21T09:00:00.000Z' }],
      error: null,
      count: 3,
    })
    const criticalReports = query({ data: null, error: null, count: 1 })
    let issueCall = 0
    const from = vi.fn((table: string) => ({
      select: vi.fn(() =>
        table === 'staff_admin_approval_requests'
          ? approvals
          : issueCall++ === 0
            ? openReports
            : criticalReports,
      ),
    }))

    const summary = await loadAdminAttentionSummary({ from } as never, {
      employeeId: 'admin-1',
      roleName: 'Master Admin',
    })

    expect(summary).toEqual({
      approvalAvailable: true,
      approvalScope: 'all',
      pendingApprovalCount: 2,
      oldestPendingApprovalAt: '2026-09-20T09:00:00.000Z',
      issueReportsIncluded: true,
      issueReportsAvailable: true,
      openIssueReportCount: 3,
      criticalIssueReportCount: 1,
      oldestOpenIssueReportAt: '2026-09-21T09:00:00.000Z',
    })
    expect(from).toHaveBeenCalledTimes(3)
  })

  it('scopes Maintenance Admin approvals to their own requests and omits issue reports', async () => {
    const approvals = query({ data: [], error: null, count: 0 })
    const from = vi.fn(() => ({ select: vi.fn(() => approvals) }))

    const summary = await loadAdminAttentionSummary({ from } as never, {
      employeeId: 'maintenance-1',
      roleName: 'Maintenance_Admin',
    })

    expect(summary.approvalScope).toBe('own')
    expect(summary.issueReportsIncluded).toBe(false)
    expect(approvals.eq).toHaveBeenCalledWith('requested_by', 'maintenance-1')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('does not query service-role Admin data for a non-admin role', async () => {
    const from = vi.fn()

    const summary = await loadAdminAttentionSummary({ from } as never, {
      employeeId: 'employee-1',
      roleName: 'Employee',
    })

    expect(summary.pendingApprovalCount).toBe(0)
    expect(summary.issueReportsIncluded).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })
})
