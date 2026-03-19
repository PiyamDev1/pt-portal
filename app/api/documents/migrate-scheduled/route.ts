/**
 * Module: app/api/documents/migrate-scheduled/route.ts
 * API route or server helper for documents/migrate-scheduled/route.ts.
 */

import { NextRequest } from 'next/server'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { migrateFallbackBatch } from '@/lib/r2Migration'

function isAuthorizedCronRequest(request: NextRequest, bodyToken?: string) {
  const cronHeader = request.headers.get('x-vercel-cron')
  const expectedToken = process.env.DOCUMENT_MIGRATION_CRON_TOKEN || ''
  const token = request.nextUrl.searchParams.get('token') || ''
  const headerToken = request.headers.get('x-migration-token') || ''

  if (cronHeader === '1') return true
  if (expectedToken && token === expectedToken) return true
  if (expectedToken && headerToken === expectedToken) return true
  if (expectedToken && bodyToken === expectedToken) return true
  return false
}

async function runScheduledMigration(
  request: NextRequest,
  body?: { token?: string; limit?: number },
) {
  if (!isAuthorizedCronRequest(request, body?.token)) {
    return apiError('Unauthorized', 401)
  }

  try {
    const health = await getDocumentStorageStatus({ runMaintenance: false })
    if (!health.connected) {
      return apiOk({
        skipped: true,
        reason: 'Primary storage is offline',
      })
    }

    const limitFromQuery = Number(request.nextUrl.searchParams.get('limit'))
    const limitFromBody = Number(body?.limit)
    const limit = Math.max(1, Math.min(100, limitFromBody || limitFromQuery || 30))
    const result = await migrateFallbackBatch(limit, { trigger: 'cron' })

    return apiOk({
      skipped: false,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Scheduled migration failed'), 500)
  }
}

export async function GET(request: NextRequest) {
  return runScheduledMigration(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return runScheduledMigration(request, body)
}
