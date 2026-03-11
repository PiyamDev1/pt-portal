'use client'

import { useEffect, useState } from 'react'
import { ArrowRightLeft, Database, Loader2, RefreshCw, Server, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

type OverviewResponse = {
  summary: {
    totalActiveDocuments: number
    primaryDocuments: number
    fallbackDocuments: number
    deletedDocuments: number
    oldestFallbackAt: string | null
    backlogAgeHours: number
  }
  health: {
    connected: boolean
    ping: number | null
    mode: 'primary' | 'fallback-upload-only' | 'offline'
    fallback?: {
      connected: boolean
      ping: number | null
      endpoint: string | null
    }
  }
  metrics: {
    lastAttemptAt: string | null
    lastSuccessAt: string | null
    lastFailureAt: string | null
    lastBatchAt: string | null
    lastBatchAttempted: number
    lastBatchMigrated: number
    lastError: string | null
  }
  recentFallbackDocuments: Array<{
    id: string
    file_name: string
    file_size: number
    category: string
    uploaded_at: string
    family_head_id: string
    minio_key: string
  }>
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function StatCard({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  }

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

export function DocumentMigrationOverviewTab() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningBatch, setRunningBatch] = useState(false)

  const loadOverview = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/documents/migration-overview', { cache: 'no-store' })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load migration overview')
      }

      setOverview(payload.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load migration overview')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const runBatchMigration = async () => {
    setRunningBatch(true)
    try {
      const response = await fetch('/api/documents/migration-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Batch migration failed')
      }

      const result = payload.data?.result
      toast.success(`Batch complete: migrated ${result?.migrated || 0} of ${result?.attempted || 0}`)
      setOverview(payload.data?.overview || null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Batch migration failed')
    } finally {
      setRunningBatch(false)
    }
  }

  const modeTone = overview?.health.mode === 'primary'
    ? 'green'
    : overview?.health.mode === 'fallback-upload-only'
      ? 'amber'
      : 'red'

  return (
    <div className="space-y-6" data-testid="document-migration-overview">
      <div className="bg-white rounded-lg shadow border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Document Migration Overview</h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Monitor whether documents are staying on the primary storage server, whether a fallback backlog exists,
              and whether automatic migration is running successfully.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void loadOverview()}
              disabled={loading || runningBatch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
            <button
              onClick={runBatchMigration}
              disabled={loading || runningBatch || !overview || !overview.health.connected}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {runningBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Run Batch Migration
            </button>
          </div>
        </div>

        {overview && (
          <div className={`rounded-lg border p-4 ${modeTone === 'green' ? 'border-green-200 bg-green-50' : modeTone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-start gap-3">
              <Server className={`w-5 h-5 mt-0.5 ${modeTone === 'green' ? 'text-green-600' : modeTone === 'amber' ? 'text-amber-600' : 'text-red-600'}`} />
              <div>
                <p className="font-semibold text-slate-900">
                  {overview.health.mode === 'primary'
                    ? 'Primary storage is online'
                    : overview.health.mode === 'fallback-upload-only'
                      ? 'Primary storage is offline, fallback uploads are active'
                      : 'Both storage paths are currently unavailable'}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  EU Server 49v2: {overview.health.connected ? `Connected${overview.health.ping !== null ? ` (${overview.health.ping}ms)` : ''}` : 'Offline'}
                  {' · '}
                  EU Server 45v5: {overview.health.fallback?.connected ? `Connected${overview.health.fallback?.ping !== null ? ` (${overview.health.fallback.ping}ms)` : ''}` : 'Offline'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !overview ? (
        <div className="bg-white rounded-lg shadow border border-slate-200 p-10 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          Loading migration overview...
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="document-migration-stats">
            <StatCard label="Active Documents" value={overview.summary.totalActiveDocuments} />
            <StatCard label="On Primary" value={overview.summary.primaryDocuments} tone="green" />
            <StatCard label="Awaiting Migration" value={overview.summary.fallbackDocuments} tone={overview.summary.fallbackDocuments > 0 ? 'amber' : 'green'} />
            <StatCard label="Oldest Pending Age" value={overview.summary.fallbackDocuments > 0 ? `${overview.summary.backlogAgeHours}h` : 'Clear'} tone={overview.summary.fallbackDocuments > 0 ? 'amber' : 'green'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-4">
                <Database className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Migration Activity</h3>
                  <p className="text-sm text-slate-600">Recent batch status captured by the running server instance.</p>
                </div>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Last attempt</dt>
                  <dd className="text-slate-900 font-medium text-right">{formatDateTime(overview.metrics.lastAttemptAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Last success</dt>
                  <dd className="text-slate-900 font-medium text-right">{formatDateTime(overview.metrics.lastSuccessAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Last failure</dt>
                  <dd className="text-slate-900 font-medium text-right">{formatDateTime(overview.metrics.lastFailureAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Last batch</dt>
                  <dd className="text-slate-900 font-medium text-right">{overview.metrics.lastBatchMigrated}/{overview.metrics.lastBatchAttempted} migrated</dd>
                </div>
              </dl>

              {overview.metrics.lastError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p className="font-medium">Last error</p>
                  <p className="mt-1">{overview.metrics.lastError}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-4">
                <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Backlog Status</h3>
                  <p className="text-sm text-slate-600">Documents still stored on the fallback path and waiting to return to primary.</p>
                </div>
              </div>

              {overview.summary.fallbackDocuments === 0 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  All active documents are currently on EU Server 49v2.
                </div>
              ) : (
                <div className="space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium">Pending documents:</span> {overview.summary.fallbackDocuments}</p>
                  <p><span className="font-medium">Oldest pending:</span> {formatDateTime(overview.summary.oldestFallbackAt)}</p>
                  <p><span className="font-medium">Deleted documents:</span> {overview.summary.deletedDocuments}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Recent Fallback Documents</h3>

            {overview.recentFallbackDocuments.length === 0 ? (
              <p className="text-sm text-slate-500">No documents are currently waiting on the fallback path.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-3 pr-4 font-medium">File</th>
                      <th className="pb-3 pr-4 font-medium">Category</th>
                      <th className="pb-3 pr-4 font-medium">Size</th>
                      <th className="pb-3 pr-4 font-medium">Uploaded</th>
                      <th className="pb-3 pr-4 font-medium">Family</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentFallbackDocuments.map((document) => (
                      <tr key={document.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-3 pr-4 text-slate-900 font-medium max-w-xs truncate">{document.file_name}</td>
                        <td className="py-3 pr-4 text-slate-600">{document.category || 'main'}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatFileSize(document.file_size)}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatDateTime(document.uploaded_at)}</td>
                        <td className="py-3 pr-4 text-slate-600">{document.family_head_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}