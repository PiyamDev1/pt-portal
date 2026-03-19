/**
 * Issue Report Detail Panel
 * Displays the selected issue report, assignment controls, and artifact actions.
 *
 * @module app/dashboard/settings/components/IssueReportDetailPanel
 */

import Image from 'next/image'

type IssueReport = {
  id: string
  created_at: string
  reporter_name: string | null
  reporter_email: string | null
  page_url: string
  route_path: string
  module_key: string
  notes: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'investigating' | 'solved' | 'closed'
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

type AgeMeta = {
  label: string
  className: string
}

type IssueReportDetailPanelProps = {
  selectedReportId: string | null
  detailLoading: boolean
  detail: IssueReportDetail | null
  assignees: Assignee[]
  currentAdminId: string | null
  selectedAssigneeId: string
  setSelectedAssigneeId: (value: string) => void
  assignmentUpdating: boolean
  updateAssignment: () => void
  statusUpdating: boolean
  updateStatus: (status: 'new' | 'investigating' | 'solved' | 'closed') => void
  getAgeMeta: (report: IssueReport) => AgeMeta
  getSeverityClasses: (severity: string) => string
  formatDate: (value: string | null | undefined) => string
  setExpandedScreenshotUrl: (value: string | null) => void
}

export function IssueReportDetailPanel({
  selectedReportId,
  detailLoading,
  detail,
  assignees,
  currentAdminId,
  selectedAssigneeId,
  setSelectedAssigneeId,
  assignmentUpdating,
  updateAssignment,
  statusUpdating,
  updateStatus,
  getAgeMeta,
  getSeverityClasses,
  formatDate,
  setExpandedScreenshotUrl,
}: IssueReportDetailPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {!selectedReportId ? (
        <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-slate-500">
          Select a ticket to review its screenshot, logs, and status history.
        </div>
      ) : detailLoading || !detail ? (
        <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-slate-500">
          Loading ticket details...
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              {(() => {
                const ageMeta = detail ? getAgeMeta(detail.report) : null
                return ageMeta ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${ageMeta.className}`}
                  >
                    {ageMeta.label}
                  </span>
                ) : null
              })()}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getSeverityClasses(detail.report.severity)}`}
                >
                  {detail.report.severity}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {detail.report.status}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  {detail.report.module_key}
                </span>
              </div>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                {detail.report.reporter_name || detail.report.reporter_email || 'Anonymous User'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">Created {formatDate(detail.report.created_at)}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(['new', 'investigating', 'solved', 'closed'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => updateStatus(status)}
                  disabled={statusUpdating || detail.report.status === status}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${detail.report.status === status ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-semibold text-slate-900">Ticket Owner</label>
                <select
                  value={selectedAssigneeId}
                  onChange={(event) => setSelectedAssigneeId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                      {currentAdminId === assignee.id ? ' (You)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={updateAssignment}
                disabled={assignmentUpdating}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {assignmentUpdating ? 'Saving...' : 'Save Owner'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Reporter Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.report.notes}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Context</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">Page:</span> {detail.report.route_path}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">URL:</span> {detail.report.page_url}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Reporter:</span>{' '}
                  {detail.report.reporter_email || 'Unknown'}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Solved At:</span>{' '}
                  {formatDate(detail.report.solved_at)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Artifact Purge:</span>{' '}
                  {formatDate(detail.report.artifact_purge_after)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Browser Context</p>
              <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(detail.report.browser_context || {}, null, 2)}
              </pre>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Screenshot</p>
                {!detail.screenshotUrl && (
                  <span className="text-xs text-slate-500">Not attached or already purged</span>
                )}
              </div>
              {detail.screenshotUrl ? (
                <button
                  type="button"
                  onClick={() => setExpandedScreenshotUrl(detail.screenshotUrl)}
                  className="mt-3 block w-full"
                >
                  <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-xl border border-slate-200">
                    <Image
                      src={detail.screenshotUrl}
                      alt="Issue report screenshot"
                      fill
                      unoptimized
                      sizes="(max-width: 1280px) 100vw, 60vw"
                      className="cursor-zoom-in object-contain bg-slate-50"
                    />
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">Click to enlarge</span>
                </button>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Screenshot unavailable.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Console Log</p>
                <span className="text-xs text-slate-500">{detail.consoleEntries.length} entries</span>
              </div>
              <div className="mt-3 max-h-[28rem] space-y-3 overflow-auto">
                {detail.consoleEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Console log unavailable.
                  </div>
                ) : (
                  detail.consoleEntries.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span className="font-semibold uppercase tracking-wide text-slate-700">
                          {entry.level}
                        </span>
                        <span>{formatDate(entry.timestamp)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {entry.message}
                      </p>
                      {entry.stack && (
                        <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                          {entry.stack}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Activity</p>
            <div className="mt-4 space-y-3">
              {detail.events.length === 0 ? (
                <p className="text-sm text-slate-500">No activity recorded yet.</p>
              ) : (
                detail.events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {event.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(event.created_at)}</p>
                    </div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                      {JSON.stringify(event.details || {}, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
