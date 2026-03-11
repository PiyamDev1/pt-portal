import { NextRequest, NextResponse } from 'next/server'
import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { migrateFallbackBatch } from '@/lib/r2Migration'

function isAuthorizedCronRequest(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  const expectedToken = process.env.DOCUMENT_MIGRATION_CRON_TOKEN || ''
  const token = request.nextUrl.searchParams.get('token') || ''

  if (cronHeader === '1') return true
  if (expectedToken && token === expectedToken) return true
  return false
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const health = await getDocumentStorageStatus({ runMaintenance: false })
    if (!health.connected) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Primary storage is offline',
      })
    }

    const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get('limit')) || 30))
    const result = await migrateFallbackBatch(limit, { trigger: 'cron' })

    return NextResponse.json({
      success: true,
      skipped: false,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scheduled migration failed',
      },
      { status: 500 }
    )
  }
}