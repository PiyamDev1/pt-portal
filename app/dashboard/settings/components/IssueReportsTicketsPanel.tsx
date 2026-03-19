type IssueReport = {
  id: string
  created_at: string
  reporter_name: string | null
  reporter_email: string | null
  module_key: string
  notes: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'investigating' | 'solved' | 'closed'
  has_screenshot: boolean
  has_console_log: boolean
  assigned_to_user_id?: string | null
}

type AgeMeta = {
  label: string
  className: string
}

type IssueReportsTicketsPanelProps = {
  reports: IssueReport[]
  selectedReportId: string | null
  onSelectReport: (reportId: string) => void
  getAgeMeta: (report: IssueReport) => AgeMeta
  getSeverityClasses: (severity: string) => string
  formatDate: (value: string | null | undefined) => string
  assigneeNameById: Map<string, string>
}

export function IssueReportsTicketsPanel({
  reports,
  selectedReportId,
  onSelectReport,
  getAgeMeta,
  getSeverityClasses,
  formatDate,
  assigneeNameById,
}: IssueReportsTicketsPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-bold text-slate-900">Tickets</h3>
        <p className="text-sm text-slate-500">Latest issue reports across the portal.</p>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {reports.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No issue reports found.</div>
        ) : (
          reports.map((report) => {
            const ageMeta = getAgeMeta(report)
            const assigneeLabel = report.assigned_to_user_id
              ? assigneeNameById.get(report.assigned_to_user_id) || 'Assigned'
              : 'Unassigned'

            return (
              <button
                key={report.id}
                type="button"
                onClick={() => onSelectReport(report.id)}
                className={`w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${selectedReportId === report.id ? 'bg-blue-50' : 'bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {report.reporter_name || report.reporter_email || 'Anonymous User'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.module_key} • {formatDate(report.created_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getSeverityClasses(report.severity)}`}
                  >
                    {report.severity}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-700">{report.notes}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-1 uppercase tracking-wide text-slate-700">
                    {report.status}
                  </span>
                  <span className={`rounded-full px-2 py-1 font-semibold ${ageMeta.className}`}>
                    {ageMeta.label}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">
                    {assigneeLabel}
                  </span>
                  {report.has_screenshot && <span>Screenshot</span>}
                  {report.has_console_log && <span>Console</span>}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
