/**
 * Maintenance Tab
 * Administrative maintenance console for migrations, data repair, and setup tasks.
 *
 * @module app/dashboard/settings/components/MaintenanceTab
 */

'use client'

import { useState } from 'react'
import { Database, AlertCircle, CheckCircle, RefreshCw, HeartPulse, ArrowDownToLine, ArrowUpToLine, ShieldAlert, History } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'

type MigrationResult = {
  message?: string
  error?: string
  requiresManualSetup?: boolean
  sql?: string
  created?: number
  skipped?: number
  errors?: number
  total?: number
  errorDetails?: string[]
}

type FrappeHealthResult = {
  ready: boolean
  ping_ok: boolean
  ping_error: string | null
  employee_provisioning_ready?: boolean
  employee_provisioning_error?: string | null
  counts: {
    outbox_pending: number
    outbox_dead_letter: number
    timeclock_attendance_pending?: number
    timeclock_attendance_dead_letter?: number
    inbox_pending: number
    conflicts_open: number
    identity_map_rows: number
    handoff_issued_24h?: number
    handoff_problem_24h?: number
  }
  recent_handoffs?: Array<{
    id: string
    user_email: string | null
    target_path: string
    response_mode: string
    client_kind: string
    status: string
    reason: string | null
    created_at: string
  }>
  sync_state: Array<{
    domain: string
    last_pull_at?: string | null
    last_push_at?: string | null
    health_status?: string | null
  }>
}

export function MaintenanceTab() {
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false)
  const [frappeLoading, setFrappeLoading] = useState(false)
  const [frappeHealth, setFrappeHealth] = useState<FrappeHealthResult | null>(null)
  const [attendanceBackfillLoading, setAttendanceBackfillLoading] = useState(false)
  const [attendanceBackfillResult, setAttendanceBackfillResult] = useState<{ queued?: number; daysBack?: number; error?: string } | null>(null)
  const [frappeActionLabel, setFrappeActionLabel] = useState<string | null>(null)

  const migrateInstallments = async () => {
    setMigrating(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/create-installments', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Migration failed')
      }

      const data: MigrationResult = await res.json()
      setResult(data)

      if (data.requiresManualSetup) {
        toast.error('Manual table setup required - see instructions below')
      } else {
        toast.success(data.message || 'Migration completed successfully')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to migrate installments'
      toast.error(message)
      setResult({ error: message })
    } finally {
      setMigrating(false)
    }
  }

  const runFrappeAction = async (
    endpoint: string,
    successMessage: string,
    actionLabel: string,
  ) => {
    setFrappeLoading(true)
    setFrappeActionLabel(actionLabel)
    try {
      const res = await fetch(endpoint, {
        method: endpoint.endsWith('/health') ? 'GET' : 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Frappe action failed')
      }
      if (data.counts) {
        setFrappeHealth(data as FrappeHealthResult)
      } else if (data.health) {
        setFrappeHealth(data.health as FrappeHealthResult)
      }
      toast.success(successMessage)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Frappe action failed'
      toast.error(message)
    } finally {
      setFrappeLoading(false)
      setFrappeActionLabel(null)
    }
  }

  const runAttendanceBackfill = async () => {
    setAttendanceBackfillLoading(true)
    setAttendanceBackfillResult(null)
    try {
      const res = await fetch('/api/cron/integrations/frappe/timeclock-attendance?daysBack=3', {
        method: 'GET',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Attendance backfill failed')
      }
      setAttendanceBackfillResult({ queued: data.queued, daysBack: data.daysBack })
      toast.success(`Queued ${data.queued || 0} attendance summaries`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Attendance backfill failed'
      setAttendanceBackfillResult({ error: message })
      toast.error(message)
    } finally {
      setAttendanceBackfillLoading(false)
    }
  }

  const formatDateTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Data Maintenance</h2>
        <p className="text-sm text-slate-600">
          Administrative tools for database maintenance and migrations
        </p>
      </div>

      <div className="border-t pt-6 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <HeartPulse className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Frappe HRMS Integration</h3>
                <p className="text-sm text-slate-600">
                  Run health checks and sync actions for the PT Portal to Frappe HRMS bridge.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void runFrappeAction('/api/integrations/frappe/health', 'Frappe health refreshed', 'Refreshing health')}
                  disabled={frappeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <HeartPulse className="w-4 h-4" />
                  Health
                </button>
                <button
                  onClick={() => void runFrappeAction('/api/integrations/frappe/sync/pull', 'Frappe leave pull completed', 'Pulling leave')}
                  disabled={frappeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  Pull Leave
                </button>
                <button
                  onClick={() => void runFrappeAction('/api/integrations/frappe/sync/push', 'Frappe outbox push completed', 'Pushing outbox')}
                  disabled={frappeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ArrowUpToLine className="w-4 h-4" />
                  Push Outbox
                </button>
                <button
                  onClick={() => void runFrappeAction('/api/integrations/frappe/reconcile', 'Frappe reconcile completed', 'Reconciling bridge data')}
                  disabled={frappeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Reconcile
                </button>
              </div>

              {frappeLoading && (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {frappeActionLabel || 'Running integration action...'}
                </div>
              )}

              {frappeHealth && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${frappeHealth.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {frappeHealth.ready ? 'Ready' : 'Needs setup'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${frappeHealth.ping_ok ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'}`}>
                      {frappeHealth.ping_ok ? 'Frappe reachable' : 'Ping failed'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${frappeHealth.employee_provisioning_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {frappeHealth.employee_provisioning_ready ? 'Employee DocType ready' : 'Employee DocType missing'}
                    </span>
                  </div>

                  {!frappeHealth.ping_ok && frappeHealth.ping_error && (
                    <p className="mt-3 text-xs text-red-700">{frappeHealth.ping_error}</p>
                  )}

                  {!frappeHealth.employee_provisioning_ready && frappeHealth.employee_provisioning_error && (
                    <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {frappeHealth.employee_provisioning_error}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">
                    <MetricCard label="Outbox pending" value={frappeHealth.counts.outbox_pending} />
                    <MetricCard label="Dead letters" value={frappeHealth.counts.outbox_dead_letter} />
                    <MetricCard label="Inbox pending" value={frappeHealth.counts.inbox_pending} />
                    <MetricCard label="Open conflicts" value={frappeHealth.counts.conflicts_open} />
                    <MetricCard label="Identity rows" value={frappeHealth.counts.identity_map_rows} />
                    <MetricCard label="Handoffs 24h" value={frappeHealth.counts.handoff_issued_24h || 0} />
                    <MetricCard label="Handoff issues" value={frappeHealth.counts.handoff_problem_24h || 0} />
                  </div>

                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="mb-1 font-bold text-slate-900">Timeclock Attendance Sync</h4>
                        <p className="text-xs text-slate-600">
                          Queues IMS clock-in summaries to Frappe. Staff should keep clocking in through IMS only.
                        </p>
                      </div>
                      <button
                        onClick={() => void runAttendanceBackfill()}
                        disabled={attendanceBackfillLoading}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${attendanceBackfillLoading ? 'animate-spin' : ''}`} />
                        {attendanceBackfillLoading ? 'Queueing...' : 'Backfill 3 Days'}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                      <MetricCard
                        label="Attendance pending"
                        value={frappeHealth.counts.timeclock_attendance_pending || 0}
                      />
                      <MetricCard
                        label="Attendance dead letters"
                        value={frappeHealth.counts.timeclock_attendance_dead_letter || 0}
                      />
                      <MetricCard
                        label="Attendance sync state"
                        value={
                          Number(
                            frappeHealth.sync_state.find((item) => item.domain === 'attendance')
                              ?.health_status === 'healthy',
                          )
                        }
                      />
                    </div>
                    {attendanceBackfillResult && (
                      <p className="mt-3 text-xs text-slate-700">
                        {attendanceBackfillResult.error
                          ? attendanceBackfillResult.error
                          : `Queued ${attendanceBackfillResult.queued || 0} summaries for ${attendanceBackfillResult.daysBack || 3} days.`}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {frappeHealth.sync_state.map((item) => (
                      <div key={item.domain} className="rounded border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        <p className="font-semibold text-slate-800">{item.domain}</p>
                        <p>Status: {item.health_status || 'unknown'}</p>
                        <p>Last pull: {item.last_pull_at || 'never'}</p>
                        <p>Last push: {item.last_push_at || 'never'}</p>
                      </div>
                    ))}
                  </div>

                  {frappeHealth.recent_handoffs && frappeHealth.recent_handoffs.length > 0 && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                        <History className="h-4 w-4 text-slate-500" />
                        Recent HRMS handoffs
                      </div>
                      <div className="space-y-2">
                        {frappeHealth.recent_handoffs.map((event) => (
                          <div
                            key={event.id}
                            className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {event.user_email || 'Unknown user'}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${
                                  event.status === 'issued'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {event.status}
                              </span>
                            </div>
                            <p className="mt-1">
                              {event.client_kind} / {event.response_mode} to {event.target_path}
                            </p>
                            {event.reason && <p className="mt-1 text-amber-700">{event.reason}</p>}
                            <p className="mt-1 text-slate-400">{formatDateTime(event.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Migrate Installment Plans</h3>
              <p className="text-sm text-slate-600 mb-3">
                Convert existing temporary installment plans to database records. This will create
                installment tracking for all service transactions that were created before the
                installment tracking system was enabled.
              </p>

              <button
                onClick={() => setShowMigrationConfirm(true)}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold rounded-lg transition-colors text-sm"
              >
                {migrating ? 'Migrating...' : 'Run Migration'}
              </button>

              {result && (
                <div
                  className={`mt-4 p-3 rounded-lg ${result.error || result.requiresManualSetup ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
                >
                  <div className="flex items-start gap-2">
                    {result.error || result.requiresManualSetup ? (
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      {result.requiresManualSetup ? (
                        <>
                          <p className="text-sm text-red-800 font-medium mb-2">
                            Manual Setup Required
                          </p>
                          <p className="text-xs text-red-700 mb-3">{result.error}</p>
                          <p className="text-xs text-red-700 font-bold mb-2">
                            Run this SQL in Supabase SQL Editor:
                          </p>
                          <pre className="text-[10px] bg-slate-900 text-green-400 p-3 rounded overflow-x-auto font-mono">
                            {result.sql}
                          </pre>
                          <p className="text-xs text-red-700 mt-2">
                            After running the SQL, try the migration again.
                          </p>
                        </>
                      ) : result.error ? (
                        <p className="text-sm text-red-800 font-medium">{result.error}</p>
                      ) : (
                        <>
                          <p className="text-sm text-green-800 font-medium mb-2">
                            {result.message}
                          </p>
                          {result.created !== undefined && (
                            <div className="text-xs text-green-700 space-y-1">
                              <p>✓ Created: {result.created} installments</p>
                              <p>✓ Skipped: {result.skipped} (already had installments)</p>
                              {(result.errors ?? 0) > 0 && (
                                <p className="text-red-700">✗ Errors: {result.errors}</p>
                              )}
                              <p>✓ Total transactions processed: {result.total}</p>
                            </div>
                          )}
                          {result.errorDetails && result.errorDetails.length > 0 && (
                            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                              <p className="font-bold text-red-800 mb-1">Error Details:</p>
                              {result.errorDetails.map((err: string, idx: number) => (
                                <p key={idx} className="text-red-700 font-mono text-[10px]">
                                  {err}
                                </p>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Important Notes</h3>
              <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                <li>Migration is safe to run multiple times - it will skip existing records</li>
                <li>New service transactions automatically create installment records</li>
                <li>Migration uses loan term data and accounts for deposits when available</li>
                <li>
                  Temporary installment displays will be replaced with database records after
                  migration
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showMigrationConfirm}
        onClose={() => setShowMigrationConfirm(false)}
        onConfirm={async () => {
          setShowMigrationConfirm(false)
          await migrateInstallments()
        }}
        title="Run Installment Migration"
        message="This will create installment records for all existing service transactions that do not have them. Continue?"
        confirmLabel="Run Migration"
        cancelLabel="Cancel"
        type="warning"
        isLoading={migrating}
      />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
