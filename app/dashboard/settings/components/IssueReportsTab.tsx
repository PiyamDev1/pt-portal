'use client'

import { useEffect, useMemo, useReducer } from 'react'
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { IssueReportsTicketsPanel } from './IssueReportsTicketsPanel'
import { IssueReportDetailPanel } from './IssueReportDetailPanel'

type IssueReport = {
  id: string
  created_at: string
  updated_at: string
  reporter_name: string | null
  reporter_email: string | null
  page_url: string
  route_path: string
  module_key: string
  notes: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'investigating' | 'solved' | 'closed'
  has_screenshot: boolean
  has_console_log: boolean
  solved_at: string | null
  assigned_to_user_id?: string | null
}

type Assignee = {
  id: string
  name: string
}

type IssueReportDetail = {
  report: IssueReport & {
    browser_context?: Record<string, unknown>
    artifact_purge_after?: string | null
  }
  artifacts: Array<{
    id: string
    artifact_type: 'screenshot' | 'console_log'
    byte_size: number
    deleted_at: string | null
  }>
  events: Array<{
    id: number
    action: string
    details: Record<string, unknown>
    created_at: string
  }>
  screenshotUrl: string | null
  consoleEntries: Array<{
    level: string
    message: string
    stack?: string
    timestamp: string
    source: string
  }>
}

const statusOptions = ['all', 'new', 'investigating', 'solved', 'closed'] as const

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

function getSeverityClasses(severity: string) {
  if (severity === 'critical') return 'bg-red-100 text-red-800 border-red-200'
  if (severity === 'high') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (severity === 'low') return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-blue-100 text-blue-800 border-blue-200'
}

type IssueReportsTabState = {
  statusFilter: (typeof statusOptions)[number]
  moduleFilter: string
  assigneeFilter: string
  search: string
  reports: IssueReport[]
  assignees: Assignee[]
  currentAdminId: string | null
  selectedReportId: string | null
  detail: IssueReportDetail | null
  selectedAssigneeId: string
  expandedScreenshotUrl: string | null
  loading: boolean
  detailLoading: boolean
  statusUpdating: boolean
  assignmentUpdating: boolean
}

type IssueReportsTabAction =
  | { type: 'setFilter'; payload: Partial<Pick<IssueReportsTabState, 'statusFilter' | 'moduleFilter' | 'assigneeFilter' | 'search'>> }
  | { type: 'setLoading'; payload: boolean }
  | { type: 'setReportsData'; payload: { reports: IssueReport[]; assignees: Assignee[]; currentAdminId: string | null } }
  | { type: 'selectReport'; payload: string | null }
  | { type: 'setDetailLoading'; payload: boolean }
  | { type: 'setDetail'; payload: { detail: IssueReportDetail | null; assigneeId?: string } }
  | { type: 'clearDetail' }
  | { type: 'setStatusUpdating'; payload: boolean }
  | { type: 'setAssignmentUpdating'; payload: boolean }
  | { type: 'setSelectedAssigneeId'; payload: string }
  | { type: 'setExpandedScreenshotUrl'; payload: string | null }

function issueReportsTabReducer(
  state: IssueReportsTabState,
  action: IssueReportsTabAction,
): IssueReportsTabState {
  switch (action.type) {
    case 'setFilter':
      return { ...state, ...action.payload }
    case 'setLoading':
      return { ...state, loading: action.payload }
    case 'setReportsData': {
      const { reports, assignees, currentAdminId } = action.payload
      let selectedReportId = state.selectedReportId
      if (!selectedReportId && reports.length) {
        selectedReportId = reports[0].id
      } else if (selectedReportId && !reports.some((r) => r.id === selectedReportId)) {
        selectedReportId = reports[0]?.id || null
      }
      return { ...state, reports, assignees, currentAdminId, selectedReportId }
    }
    case 'selectReport':
      return { ...state, selectedReportId: action.payload }
    case 'setDetailLoading':
      return { ...state, detailLoading: action.payload }
    case 'setDetail':
      return {
        ...state,
        detail: action.payload.detail,
        selectedAssigneeId: action.payload.assigneeId ?? state.selectedAssigneeId,
        detailLoading: false,
      }
    case 'clearDetail':
      return { ...state, detail: null, expandedScreenshotUrl: null }
    case 'setStatusUpdating':
      return { ...state, statusUpdating: action.payload }
    case 'setAssignmentUpdating':
      return { ...state, assignmentUpdating: action.payload }
    case 'setSelectedAssigneeId':
      return { ...state, selectedAssigneeId: action.payload }
    case 'setExpandedScreenshotUrl':
      return { ...state, expandedScreenshotUrl: action.payload }
    default:
      return state
  }
}

export function IssueReportsTab() {
  const [state, dispatch] = useReducer(issueReportsTabReducer, {
    statusFilter: 'all',
    moduleFilter: 'all',
    assigneeFilter: 'all',
    search: '',
    reports: [],
    assignees: [],
    currentAdminId: null,
    selectedReportId: null,
    detail: null,
    loading: false,
    detailLoading: false,
    statusUpdating: false,
    assignmentUpdating: false,
    selectedAssigneeId: '',
    expandedScreenshotUrl: null,
  })
  const {
    statusFilter, moduleFilter, assigneeFilter, search,
    reports, assignees, currentAdminId,
    selectedReportId, detail, selectedAssigneeId, expandedScreenshotUrl,
    loading, detailLoading, statusUpdating, assignmentUpdating,
  } = state

  const modules = useMemo(
    () => ['all', ...Array.from(new Set(reports.map((report) => report.module_key)))],
    [reports],
  )

  const fetchReports = async () => {
    dispatch({ type: 'setLoading', payload: true })
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      params.set('module', moduleFilter)
      params.set('assignedTo', assigneeFilter)
      if (search.trim()) params.set('search', search.trim())

      const response = await fetch(`/api/admin/issue-reports?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load issue reports')
      }

      dispatch({
        type: 'setReportsData',
        payload: {
          reports: data.reports || [],
          assignees: data.assignees || [],
          currentAdminId: data.currentAdminId || null,
        },
      })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load issue reports')
    } finally {
      dispatch({ type: 'setLoading', payload: false })
    }
  }

  const fetchDetail = async (reportId: string) => {
    dispatch({ type: 'setDetailLoading', payload: true })
    try {
      const response = await fetch(`/api/admin/issue-reports/${reportId}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load issue report detail')
      }
      dispatch({
        type: 'setDetail',
        payload: { detail: data, assigneeId: data?.report?.assigned_to_user_id || '' },
      })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load issue report detail')
      dispatch({ type: 'setDetail', payload: { detail: null } })
    } finally {
      dispatch({ type: 'setDetailLoading', payload: false })
    }
  }

  const updateAssignment = async () => {
    if (!selectedReportId) return
    dispatch({ type: 'setAssignmentUpdating', payload: true })
    try {
      const response = await fetch(`/api/admin/issue-reports/${selectedReportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToUserId: selectedAssigneeId || null }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update assignment')
      }
      toast.success('Assignee updated')
      await Promise.all([fetchReports(), fetchDetail(selectedReportId)])
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update assignment')
    } finally {
      dispatch({ type: 'setAssignmentUpdating', payload: false })
    }
  }

  const updateStatus = async (status: IssueReport['status']) => {
    if (!selectedReportId) return
    dispatch({ type: 'setStatusUpdating', payload: true })
    try {
      const response = await fetch(`/api/admin/issue-reports/${selectedReportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update issue status')
      }
      toast.success('Issue status updated')
      await Promise.all([fetchReports(), fetchDetail(selectedReportId)])
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update issue status')
    } finally {
      dispatch({ type: 'setStatusUpdating', payload: false })
    }
  }

  useEffect(() => {
    fetchReports()
  }, [statusFilter, moduleFilter, assigneeFilter])

  useEffect(() => {
    if (selectedReportId) {
      fetchDetail(selectedReportId)
    } else {
      dispatch({ type: 'clearDetail' })
    }
  }, [selectedReportId])

  const { openCount, solvedCount } = useMemo(
    () =>
      reports.reduce(
        (counts, report) => {
          if (report.status === 'new' || report.status === 'investigating') {
            counts.openCount += 1
          }
          if (report.status === 'solved' || report.status === 'closed') {
            counts.solvedCount += 1
          }
          return counts
        },
        { openCount: 0, solvedCount: 0 },
      ),
    [reports],
  )

  const getAgeMeta = (report: Pick<IssueReport, 'created_at' | 'status'>) => {
    const now = Date.now()
    const created = new Date(report.created_at).getTime()
    const hours = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60)))
    const days = Math.floor(hours / 24)
    const label = days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`
    const isOpen = report.status === 'new' || report.status === 'investigating'

    if (!isOpen) {
      return { label: `Resolved (${label})`, className: 'bg-slate-100 text-slate-600' }
    }
    if (hours >= 72) {
      return { label: `Stale ${label}`, className: 'bg-red-100 text-red-700' }
    }
    if (hours >= 24) {
      return { label: `Aging ${label}`, className: 'bg-amber-100 text-amber-700' }
    }
    return { label: `New ${label}`, className: 'bg-emerald-100 text-emerald-700' }
  }

  const assigneeNameById = useMemo(() => {
    const map = new Map<string, string>()
    assignees.forEach((assignee) => map.set(assignee.id, assignee.name))
    return map
  }, [assignees])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Master Admin Console
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">Fault Reports</h2>
            <p className="mt-2 text-sm text-slate-200">
              Review user-submitted faults from every page, keep artifacts for 30 days after
              solving, and rely on nightly cleanup for solved tickets after 60 days.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">Open</p>
              <p className="mt-1 text-2xl font-bold">{openCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">Solved / Closed</p>
              <p className="mt-1 text-2xl font-bold">{solvedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[160px_170px_180px_1fr_auto]">
          <select
            value={statusFilter}
            onChange={(event) =>
              dispatch({ type: 'setFilter', payload: { statusFilter: event.target.value as (typeof statusOptions)[number] } })
            }
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All statuses' : option}
              </option>
            ))}
          </select>

          <select
            value={moduleFilter}
            onChange={(event) => dispatch({ type: 'setFilter', payload: { moduleFilter: event.target.value } })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            {modules.map((module) => (
              <option key={module} value={module}>
                {module === 'all' ? 'All modules' : module}
              </option>
            ))}
          </select>

          <select
            value={assigneeFilter}
            onChange={(event) => dispatch({ type: 'setFilter', payload: { assigneeFilter: event.target.value } })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">All owners</option>
            <option value="unassigned">Unassigned</option>
            <option value="me">My queue</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(event) => dispatch({ type: 'setFilter', payload: { search: event.target.value } })}
            placeholder="Search notes, page URL, or reporter"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          />

          <button
            type="button"
            onClick={() => fetchReports()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <IssueReportsTicketsPanel
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => dispatch({ type: 'selectReport', payload: id })}
          getAgeMeta={getAgeMeta}
          getSeverityClasses={getSeverityClasses}
          formatDate={formatDate}
          assigneeNameById={assigneeNameById}
        />

        <IssueReportDetailPanel
          selectedReportId={selectedReportId}
          detailLoading={detailLoading}
          detail={detail}
          assignees={assignees}
          currentAdminId={currentAdminId}
          selectedAssigneeId={selectedAssigneeId}
          setSelectedAssigneeId={(id) => dispatch({ type: 'setSelectedAssigneeId', payload: id })}
          assignmentUpdating={assignmentUpdating}
          updateAssignment={updateAssignment}
          statusUpdating={statusUpdating}
          updateStatus={updateStatus}
          getAgeMeta={getAgeMeta}
          getSeverityClasses={getSeverityClasses}
          formatDate={formatDate}
          setExpandedScreenshotUrl={(url) => dispatch({ type: 'setExpandedScreenshotUrl', payload: url })}
        />
      </section>

      {expandedScreenshotUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dispatch({ type: 'setExpandedScreenshotUrl', payload: null })
            }
          }}
        >
          <div className="relative max-h-[92vh] max-w-[95vw]">
            <button
              type="button"
              onClick={() => dispatch({ type: 'setExpandedScreenshotUrl', payload: null })}
              className="absolute right-2 top-2 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-900"
            >
              Close
            </button>
            <img
              src={expandedScreenshotUrl}
              alt="Expanded issue report screenshot"
              className="max-h-[92vh] max-w-[95vw] rounded-xl border border-white/20 bg-slate-900 object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
