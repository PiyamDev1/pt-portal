/**
 * Module: app/api/documents/migrate-scheduled/route.ts
 * API route or server helper for documents/migrate-scheduled/route.ts.
 */

import { NextRequest } from 'next/server'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { migrateFallbackBatch } from '@/lib/r2Migration'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

const scheduledMigrationSchema = z.object({
  token: z.string().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

function tokensMatch(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(expected)
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  )
}

function isAuthorizedCronRequest(request: NextRequest, bodyToken?: string) {
  const expectedToken = process.env.DOCUMENT_MIGRATION_CRON_TOKEN || process.env.CRON_SECRET || ''
  if (!expectedToken) return false

  const authorization = request.headers.get('authorization') || ''
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const headerToken = request.headers.get('x-migration-token') || ''

  return [bearerToken, headerToken, bodyToken || ''].some(
    (provided) => provided && tokensMatch(provided, expectedToken),
  )
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
  const { data: body, error } = await parseBodyWithSchema(request, scheduledMigrationSchema, {
    maxBytes: 4 * 1024,
  })
  if (error || !body) return apiError(error || 'Invalid request payload', 400)
  return runScheduledMigration(request, body)
}
