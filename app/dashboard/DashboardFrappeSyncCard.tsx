'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, ShieldCheck, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

type SyncHealth = {
  counts?: {
    timeclock_attendance_pending?: number
    timeclock_attendance_dead_letter?: number
  }
  sync_state?: Array<{
    domain: string
    health_status?: string | null
    last_push_at?: string | null
    last_pull_at?: string | null
  }>
  error?: string
}

export function DashboardFrappeSyncCard() {
  const [health, setHealth] = useState<SyncHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)

  const loadHealth = () => {
    let cancelled = false
    setLoading(true)
    fetch('/api/integrations/frappe/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setHealth(data)
      })
      .catch(() => {
        if (!cancelled) setHealth({ error: 'Unable to load Frappe sync status' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    const cleanup = loadHealth()
    return cleanup
  }, [])

  const handleBackfill = async () => {
    setBackfilling(true)
    const toastId = toast.loading('Queueing attendance backfill...')
    try {
      const res = await fetch('/api/cron/integrations/frappe/timeclock-attendance?daysBack=3')
      const data = (await res.json().catch(() => null)) as null | {
        error?: string
        message?: string
        queued?: number
      }
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Unable to queue backfill')
      }
      toast.success(data?.message || `Queued ${data?.queued || 0} attendance summaries`, {
        id: toastId,
      })
      loadHealth()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to queue backfill', {
        id: toastId,
      })
    } finally {
      setBackfilling(false)
    }
  }

  const attendance = health?.sync_state?.find((item) => item.domain === 'attendance')

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8b1e2d]">
            Frappe bridge
          </p>
          <h2 className="mt-1 text-base font-black text-slate-950">Attendance sync</h2>
          <p className="mt-1 text-sm text-slate-500">
            IMS timeclock is the source of truth. Frappe receives daily attendance summaries.
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Pending" value={health?.counts?.timeclock_attendance_pending || 0} />
        <Metric label="Dead letters" value={health?.counts?.timeclock_attendance_dead_letter || 0} />
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-bold text-slate-900">Status</p>
        <p className="mt-1">{loading ? 'Loading...' : attendance?.health_status || health?.error || 'unknown'}</p>
        {attendance?.last_push_at && <p className="mt-1">Last push: {attendance.last_push_at}</p>}
        {attendance?.last_pull_at && <p className="mt-1">Last pull: {attendance.last_pull_at}</p>}
      </div>

      {backfilling && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          Backfill queued. We are refreshing the sync summary now.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/dashboard/settings?tab=maintenance"
          className="inline-flex items-center gap-2 rounded-full bg-[#8b1e2d] px-4 py-2 text-xs font-black text-white"
        >
          Sync now
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={backfilling}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {backfilling ? 'Backfilling...' : 'Backfill now'}
        </button>
        <button
          type="button"
          onClick={() => {
            loadHealth()
            toast.info('Refreshing Frappe sync status')
          }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  )
}
