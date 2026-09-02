'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type Lookup = { id: string; name: string }
type EmployeeLookup = { id: string; full_name: string; email: string }

type ApprovalRequest = {
  id: string
  target_employee_id: string
  requested_by: string
  proposed_full_name: string
  proposed_role_id: string
  proposed_department_ids: string[]
  proposed_location_id: string | null
  proposed_manager_id: string | null
  request_reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  review_reason: string | null
  reviewed_at: string | null
  created_at: string
}

type ApprovalQueueTabProps = {
  canReview: boolean
  employees: EmployeeLookup[]
  roles: Lookup[]
  departments: Lookup[]
  locations: Lookup[]
}

export function ApprovalQueueTab({
  canReview,
  employees,
  roles,
  departments,
  locations,
}: ApprovalQueueTabProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  )
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles])
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments],
  )
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  )

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/approval-requests', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load approval requests')
      setRequests(Array.isArray(result.requests) ? result.requests : [])
    } catch (error) {
      toast.error('Unable to load approval queue', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const review = async (requestId: string, decision: 'approved' | 'rejected') => {
    const reviewReason = (reviewNotes[requestId] || '').trim()
    if (reviewReason.length < 3) {
      toast.error('Enter a review note of at least 3 characters')
      return
    }

    setReviewingId(requestId)
    try {
      const response = await fetch('/api/admin/approval-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          decision,
          review_reason: reviewReason,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to review request')
      toast.success(decision === 'approved' ? 'Change approved and applied' : 'Request rejected')
      await loadRequests()
    } catch (error) {
      toast.error('Unable to review request', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Staff Approval Queue</h2>
          <p className="mt-1 text-sm text-slate-600">
            {canReview
              ? 'Review Maintenance Admin proposals. Approval applies the complete staff change atomically.'
              : 'Track the staff changes you submitted for Admin approval.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!loading && requests.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No approval requests yet.
        </div>
      )}

      <div className="space-y-3">
        {requests.map((request) => {
          const target = employeeById.get(request.target_employee_id)
          const requester = employeeById.get(request.requested_by)
          const reviewer = request.reviewed_by ? employeeById.get(request.reviewed_by) : null
          return (
            <article key={request.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    {target?.full_name || request.proposed_full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Requested by {requester?.full_name || 'Maintenance Admin'} on{' '}
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                    request.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : request.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {request.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <ProposalField label="Name" value={request.proposed_full_name} />
                <ProposalField
                  label="Role"
                  value={roleById.get(request.proposed_role_id) || 'Unknown role'}
                />
                <ProposalField
                  label="Departments"
                  value={request.proposed_department_ids
                    .map((id) => departmentById.get(id) || 'Unknown')
                    .join(', ')}
                />
                <ProposalField
                  label="Branch"
                  value={
                    request.proposed_location_id
                      ? locationById.get(request.proposed_location_id) || 'Unknown branch'
                      : 'No branch'
                  }
                />
                <ProposalField
                  label="Manager"
                  value={
                    request.proposed_manager_id
                      ? employeeById.get(request.proposed_manager_id)?.full_name ||
                        'Unknown manager'
                      : 'No manager'
                  }
                />
              </div>

              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold">Request reason:</span> {request.request_reason}
              </div>

              {request.status === 'pending' && canReview && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={reviewNotes[request.id] || ''}
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    maxLength={1000}
                    placeholder="Review note (required)"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    aria-label={`Review note for ${target?.full_name || request.proposed_full_name}`}
                  />
                  <button
                    type="button"
                    onClick={() => void review(request.id, 'approved')}
                    disabled={reviewingId === request.id}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Approve & Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(request.id, 'rejected')}
                    disabled={reviewingId === request.id}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {request.status !== 'pending' && request.review_reason && (
                <p className="mt-3 text-xs text-slate-500">
                  Reviewed by {reviewer?.full_name || 'Admin'}: {request.review_reason}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ProposalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  )
}
