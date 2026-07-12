'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FileSearch,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'

type MigrationStatus = {
  configuration?: { firebase: boolean; sourceStorage: boolean }
  counts?: {
    migrationRecords: number
    importedPackages: number
    migratedDocuments: number
    failedBackups: number
  }
  runs?: Array<Record<string, unknown>>
  records?: Array<Record<string, unknown>>
  error?: string
}

export default function PackageMigrationClient() {
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [scan, setScan] = useState<Record<string, unknown> | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [pageToken, setPageToken] = useState<string | null>(null)

  const loadStatus = async () => {
    const response = await fetch('/api/travel-packages/migration/status')
    const data = (await response.json()) as MigrationStatus
    if (!response.ok) throw new Error(data.error || 'Failed to load migration status')
    setStatus(data)
  }

  useEffect(() => {
    void loadStatus().catch((error) =>
      toast.error(error instanceof Error ? error.message : 'Failed to load migration status'),
    )
  }, [])

  const runScanAction = async (action: 'test' | 'scan') => {
    setRunning(action)
    try {
      const response = await fetch('/api/travel-packages/migration/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, limit: 50, pageToken }),
      })
      const data = (await response.json()) as Record<string, unknown> & {
        error?: string
        nextPageToken?: string | null
      }
      if (!response.ok) throw new Error(data.error || `${action} failed`)
      setScan(data)
      if (action === 'test') setPageToken(null)
      toast.success(action === 'test' ? 'Connection test complete' : 'Legacy records scanned')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${action} failed`)
    } finally {
      setRunning(null)
    }
  }

  const runImport = async (mode: 'dry_run' | 'sample' | 'full' | 'retry') => {
    if (
      mode === 'full' &&
      !window.confirm(
        'Import this batch into live package folders? Existing imported records will be skipped.',
      )
    )
      return
    setRunning(mode)
    try {
      const response = await fetch('/api/travel-packages/migration/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          dryRun: mode === 'dry_run',
          limit: mode === 'sample' ? 5 : 25,
          pageToken: mode === 'full' ? pageToken : null,
        }),
      })
      const data = (await response.json()) as Record<string, unknown> & {
        error?: string
        nextPageToken?: string | null
      }
      if (!response.ok) throw new Error(data.error || 'Migration failed')
      setScan(data)
      if (mode === 'full') setPageToken(data.nextPageToken || null)
      await loadStatus()
      toast.success(mode === 'dry_run' ? 'Dry run complete' : 'Migration batch complete')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Migration failed')
    } finally {
      setRunning(null)
    }
  }

  const reconcileBackups = async () => {
    setRunning('backup_reconcile')
    try {
      const response = await fetch('/api/travel-packages/backups/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      })
      const data = (await response.json()) as Record<string, unknown> & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Backup reconciliation failed')
      setScan(data)
      await loadStatus()
      toast.success('Package backup reconciliation complete')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup reconciliation failed')
    } finally {
      setRunning(null)
    }
  }

  const exportReport = () => {
    const blob = new Blob([JSON.stringify({ status, latestResult: scan }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `package-migration-report-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const config = status?.configuration
  const counts = status?.counts
  return (
    <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-[#8b1e2d]">Super Admin</p>
            <h1 className="mt-1 text-2xl font-black">Legacy bookings migration</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Scan Firebase customer folders, copy package files from R3 into the package MinIO
              bucket, and reconcile every imported record before the old portal is retired.
            </p>
          </div>
          <button
            onClick={() => void loadStatus()}
            title="Refresh status"
            className="border border-slate-300 p-2 text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="border border-slate-200 bg-white p-4">
          <Database className="h-5 w-5 text-[#8b1e2d]" />
          <p className="mt-2 text-xs font-bold uppercase text-slate-500">Firebase</p>
          <p className="mt-1 text-sm font-black">
            {config?.firebase ? 'Configured' : 'Missing env keys'}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <HardDrive className="h-5 w-5 text-[#8b1e2d]" />
          <p className="mt-2 text-xs font-bold uppercase text-slate-500">R3 source storage</p>
          <p className="mt-1 text-sm font-black">
            {config?.sourceStorage ? 'Configured' : 'Missing env keys'}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-2 text-xs font-bold uppercase text-slate-500">Imported packages</p>
          <p className="mt-1 text-2xl font-black">{counts?.importedPackages || 0}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <p className="mt-2 text-xs font-bold uppercase text-slate-500">Failed backups</p>
          <p className="mt-1 text-2xl font-black">{counts?.failedBackups || 0}</p>
        </div>
      </section>
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Migration controls</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => void runScanAction('test')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-black"
          >
            <Database className="h-4 w-4" />
            Test connections
          </button>
          <button
            onClick={() => void runScanAction('scan')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-black"
          >
            <FileSearch className="h-4 w-4" />
            Scan records
          </button>
          <button
            onClick={() => void runImport('dry_run')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-black"
          >
            <Play className="h-4 w-4" />
            Dry run
          </button>
          <button
            onClick={() => void runImport('sample')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 bg-slate-900 px-3 py-2 text-xs font-black text-white"
          >
            Import sample
          </button>
          <button
            onClick={() => void runImport('full')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
          >
            Import batch
          </button>
          <button
            onClick={() => void runImport('retry')}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"
          >
            Retry failures
          </button>
          <button
            onClick={() => void reconcileBackups()}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-black"
          >
            <HardDrive className="h-4 w-4" />
            Reconcile backups
          </button>
          <button
            onClick={exportReport}
            disabled={!status && !scan}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-black disabled:opacity-40"
          >
            Export report
          </button>
          {running && (
            <span className="inline-flex items-center gap-2 px-2 text-xs font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {running.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Each live batch is capped to keep imports resumable. Continue with the returned cursor
          until no next page remains.
        </p>
      </section>
      {scan && (
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Latest result</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            {JSON.stringify(scan, null, 2)}
          </pre>
        </section>
      )}
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Recent runs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Imported</th>
                <th className="px-3 py-2">Failed</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(status?.runs || []).map((run) => (
                <tr key={String(run.id)}>
                  <td className="px-3 py-2 font-bold">{String(run.mode)}</td>
                  <td className="px-3 py-2">{String(run.status)}</td>
                  <td className="px-3 py-2">{String(run.source_count || 0)}</td>
                  <td className="px-3 py-2">{String(run.imported_count || 0)}</td>
                  <td className="px-3 py-2">{String(run.failed_count || 0)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {String(run.created_at || '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
