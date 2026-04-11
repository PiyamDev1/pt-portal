/**
 * Receipt metrics admin tab.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { API_ENDPOINTS } from '@/lib/constants/api'

type MetricsPayload = {
  supported: boolean
  message?: string
  summary: {
    totalReceipts: number
    sharedReceipts: number
    totalShares: number
    shareRate: number
  } | null
  byService: Array<{ serviceType: string; receipts: number }>
  byChannel: Array<{ channel: string; shares: number }>
  recent: Array<{
    id: string
    serviceType: string
    receiptType: string
    generatedAt: string | null
    isShared: boolean
    sharedVia: string | null
    shareCount: number
  }>
  backfill: {
    nullShareCountRows: number
    nullSharedViaRows: number
    healthy: boolean
  } | null
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export function ReceiptMetricsTab() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MetricsPayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(API_ENDPOINTS.ADMIN_RECEIPT_METRICS, { cache: 'no-store' })
      const payload = (await res.json()) as MetricsPayload & { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load receipt metrics')
      }
      setData(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load receipt metrics')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return <div className="text-sm text-slate-500">Loading receipt metrics...</div>
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Unable to load receipt metrics.</p>
        <button
          onClick={() => void load()}
          className="px-3 py-2 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800"
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data.supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
        {data.message || 'Receipt metrics are not available yet.'}
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="receipt-metrics-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Receipt Metrics</h2>
          <p className="text-sm text-slate-600 mt-1">Generation, share, and backfill health overview.</p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
          type="button"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Receipts" value={data.summary?.totalReceipts || 0} />
        <StatCard label="Shared Receipts" value={data.summary?.sharedReceipts || 0} />
        <StatCard label="Total Shares" value={data.summary?.totalShares || 0} />
        <StatCard label="Share Rate" value={`${data.summary?.shareRate || 0}%`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">By Service</h3>
          <div className="mt-3 space-y-2 text-sm">
            {data.byService.length === 0 ? (
              <p className="text-slate-500">No data yet.</p>
            ) : (
              data.byService.map((row) => (
                <div key={row.serviceType} className="flex justify-between">
                  <span className="text-slate-700">{row.serviceType}</span>
                  <span className="font-semibold text-slate-900">{row.receipts}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">By Share Channel</h3>
          <div className="mt-3 space-y-2 text-sm">
            {data.byChannel.length === 0 ? (
              <p className="text-slate-500">No data yet.</p>
            ) : (
              data.byChannel.map((row) => (
                <div key={row.channel} className="flex justify-between">
                  <span className="text-slate-700">{row.channel}</span>
                  <span className="font-semibold text-slate-900">{row.shares}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">Backfill Health</h3>
        <p className="mt-2 text-sm text-slate-600">
          Null share_count rows: <span className="font-semibold">{data.backfill?.nullShareCountRows ?? 0}</span>
          {' '}• Null shared_via rows: <span className="font-semibold">{data.backfill?.nullSharedViaRows ?? 0}</span>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">Recent Receipts</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-2">Service</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Generated</th>
                <th className="text-left py-2">Shared</th>
                <th className="text-left py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-slate-500">
                    No recent receipts.
                  </td>
                </tr>
              ) : (
                data.recent.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2">{row.serviceType}</td>
                    <td className="py-2">{row.receiptType}</td>
                    <td className="py-2">{row.generatedAt ? new Date(row.generatedAt).toLocaleString('en-GB') : 'N/A'}</td>
                    <td className="py-2">{row.sharedVia || (row.isShared ? 'yes' : 'no')}</td>
                    <td className="py-2">{row.shareCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
