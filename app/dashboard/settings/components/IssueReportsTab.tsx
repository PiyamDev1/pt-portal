'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

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
}

type IssueReportDetail = {
  report: IssueReport & {
    browser_context?: Record<string, any>
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
    details: Record<string, any>
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

export function IssueReportsTab() {
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reports, setReports] = useState<IssueReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [detail, setDetail] = useState<IssueReportDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const modules = useMemo(() => ['all', ...Array.from(new Set(reports.map((report) => report.module_key)))], [reports])

  const fetchReports = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      params.set('module', moduleFilter)
      if (search.trim()) params.set('search', search.trim())

      const response = await fetch(`/api/admin/issue-reports?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load issue reports')
      }

      setReports(data.reports || [])
      if (!selectedReportId && data.reports?.length) {
        setSelectedReportId(data.reports[0].id)
      }
      if (selectedReportId && !(data.reports || []).some((report: IssueReport) => report.id === selectedReportId)) {
        setSelectedReportId(data.reports?.[0]?.id || null)
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load issue reports')
    } finally {
      setLoading(false)
    }
  }

  const fetchDetail = async (reportId: string) => {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/admin/issue-reports/${reportId}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load issue report detail')
      }
      setDetail(data)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load issue report detail')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const updateStatus = async (status: IssueReport['status']) => {
    if (!selectedReportId) return
    setStatusUpdating(true)
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
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update issue status')
    } finally {
      setStatusUpdating(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [statusFilter, moduleFilter])

  useEffect(() => {
    if (selectedReportId) {
      fetchDetail(selectedReportId)
    } else {
      setDetail(null)
    }
  }, [selectedReportId])

  const openCount = reports.filter((report) => report.status === 'new' || report.status === 'investigating').length
  const solvedCount = reports.filter((report) => report.status === 'solved' || report.status === 'closed').length

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
              Review user-submitted faults from every page, keep artifacts for 30 days after solving, and rely on nightly cleanup for solved tickets after 60 days.
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
        <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as (typeof statusOptions)[number])}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{option === 'all' ? 'All statuses' : option}</option>
            ))}
          </select>

          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            {modules.map((module) => (
              <option key={module} value={module}>{module === 'all' ? 'All modules' : module}</option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-lg font-bold text-slate-900">Tickets</h3>
            <p className="text-sm text-slate-500">Latest issue reports across the portal.</p>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No issue reports found.</div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${selectedReportId === report.id ? 'bg-blue-50' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{report.reporter_name || report.reporter_email || 'Anonymous User'}</p>
                      <p className="mt-1 text-xs text-slate-500">{report.module_key} • {formatDate(report.created_at)}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getSeverityClasses(report.severity)}`}>
                      {report.severity}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-700">{report.notes}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-1 uppercase tracking-wide text-slate-700">{report.status}</span>
                    {report.has_screenshot && <span>Screenshot</span>}
                    {report.has_console_log && <span>Console</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!selectedReportId ? (
            <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-slate-500">
              Select a ticket to review its screenshot, logs, and status history.
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-slate-500">Loading ticket details...</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getSeverityClasses(detail.report.severity)}`}>
                      {detail.report.severity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                      {detail.report.status}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      {detail.report.module_key}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-bold text-slate-900">{detail.report.reporter_name || detail.report.reporter_email || 'Anonymous User'}</h3>
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
                <p className="text-sm font-semibold text-slate-900">Reporter Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.report.notes}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Context</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-800">Page:</span> {detail.report.route_path}</p>
                    <p><span className="font-semibold text-slate-800">URL:</span> {detail.report.page_url}</p>
                    <p><span className="font-semibold text-slate-800">Reporter:</span> {detail.report.reporter_email || 'Unknown'}</p>
                    <p><span className="font-semibold text-slate-800">Solved At:</span> {formatDate(detail.report.solved_at)}</p>
                    <p><span className="font-semibold text-slate-800">Artifact Purge:</span> {formatDate(detail.report.artifact_purge_after)}</p>
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
                    {!detail.screenshotUrl && <span className="text-xs text-slate-500">Not attached or already purged</span>}
                  </div>
                  {detail.screenshotUrl ? (
                    <img src={detail.screenshotUrl} alt="Issue report screenshot" className="mt-3 w-full rounded-xl border border-slate-200" />
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
                        <div key={`${entry.timestamp}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span className="font-semibold uppercase tracking-wide text-slate-700">{entry.level}</span>
                            <span>{formatDate(entry.timestamp)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{entry.message}</p>
                          {entry.stack && (
                            <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{entry.stack}</pre>
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
                          <p className="text-sm font-semibold text-slate-900">{event.action.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500">{formatDate(event.created_at)}</p>
                        </div>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(event.details || {}, null, 2)}</pre>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
