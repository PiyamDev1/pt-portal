/**
 * GET /api/admin/receipt-metrics
 * Returns receipt generation, sharing, and backfill health metrics for admins.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type ReceiptRow = {
  id: string
  service_type: string | null
  receipt_type: string | null
  generated_at: string | null
  is_shared: boolean | null
  shared_via: string | null
  share_count: number | null
}

export async function GET() {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getSupabaseClient()

    const { data, error, count } = await supabase
      .from('generated_receipts')
      .select('id, service_type, receipt_type, generated_at, is_shared, shared_via, share_count', {
        count: 'exact',
      })
      .order('generated_at', { ascending: false })
      .limit(1000)

    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (error.code === '42P01' || message.includes('does not exist') || message.includes('relation')) {
        return apiOk({
          supported: false,
          message: 'generated_receipts table is not available yet',
          summary: null,
          byService: [],
          byChannel: [],
          recent: [],
          backfill: null,
        })
      }
      throw error
    }

    const rows = (data || []) as ReceiptRow[]
    const totalReceipts = count || 0
    const sharedReceipts = rows.filter((row) => !!row.is_shared).length
    const totalShares = rows.reduce((sum, row) => sum + Number(row.share_count || 0), 0)

    const byServiceMap = new Map<string, number>()
    const byChannelMap = new Map<string, number>()

    let nullShareCountRows = 0
    let nullSharedViaRows = 0

    for (const row of rows) {
      const service = row.service_type || 'unknown'
      byServiceMap.set(service, Number(byServiceMap.get(service) || 0) + 1)

      const channel = row.shared_via || 'untracked'
      byChannelMap.set(channel, Number(byChannelMap.get(channel) || 0) + Number(row.share_count || 0))

      if (row.is_shared && row.share_count == null) {
        nullShareCountRows += 1
      }
      if (row.is_shared && !row.shared_via) {
        nullSharedViaRows += 1
      }
    }

    const byService = Array.from(byServiceMap.entries())
      .map(([serviceType, receipts]) => ({ serviceType, receipts }))
      .sort((a, b) => b.receipts - a.receipts)

    const byChannel = Array.from(byChannelMap.entries())
      .map(([channel, shares]) => ({ channel, shares }))
      .sort((a, b) => b.shares - a.shares)

    const recent = rows.slice(0, 25).map((row) => ({
      id: row.id,
      serviceType: row.service_type || 'unknown',
      receiptType: row.receipt_type || 'unknown',
      generatedAt: row.generated_at,
      isShared: !!row.is_shared,
      sharedVia: row.shared_via || null,
      shareCount: Number(row.share_count || 0),
    }))

    return apiOk({
      supported: true,
      summary: {
        totalReceipts,
        sharedReceipts,
        totalShares,
        shareRate: totalReceipts > 0 ? Math.round((sharedReceipts / totalReceipts) * 1000) / 10 : 0,
      },
      byService,
      byChannel,
      recent,
      backfill: {
        nullShareCountRows,
        nullSharedViaRows,
        healthy: nullShareCountRows === 0,
      },
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load receipt metrics'), 500)
  }
}
