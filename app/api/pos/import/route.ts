import { createHash } from 'node:crypto'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { isPosManager } from '@/lib/pos/access'
import type { PosLegacyImportPreview } from '@/lib/pos/contracts'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { posImportSchema } from '@/lib/pos/inputContracts'
import { runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function rowKey(source: string, key: string) {
  return `${source}\u0000${key}`
}

function importIdempotencyKey(source: string, key: string) {
  return `pos-import:${createHash('sha256').update(rowKey(source, key)).digest('hex')}`
}

export async function POST(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  if (!isPosManager(access))
    return apiError('Manager access required.', 403, {}, POS_PRIVATE_RESPONSE)
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.legacy-import',
    limit: 10,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const { data, error } = await parseBodyWithSchema(request, posImportSchema, {
    maxBytes: 2 * 1024 * 1024,
  })
  if (!data || error) return apiError(error || 'Invalid import.', 400, {}, POS_PRIVATE_RESPONSE)

  const uniqueSources = [...new Set(data.rows.map((row) => row.legacySource))]
  const uniqueRowKeys = [...new Set(data.rows.map((row) => row.legacyRowKey))]
  const { data: existing, error: duplicateError } = await getServiceSupabaseClient()
    .from('pos_transactions')
    .select('legacy_source,legacy_row_key')
    .in('legacy_source', uniqueSources)
    .in('legacy_row_key', uniqueRowKeys)
  if (duplicateError) return posErrorResponse(duplicateError)
  const duplicateSet = new Set(
    (existing || []).map((row) => rowKey(row.legacy_source || '', row.legacy_row_key || '')),
  )
  const duplicates = data.rows
    .filter((row) => duplicateSet.has(rowKey(row.legacySource, row.legacyRowKey)))
    .map((row) => ({ legacySource: row.legacySource, legacyRowKey: row.legacyRowKey }))
  const pendingRows = data.rows.filter(
    (row) => !duplicateSet.has(rowKey(row.legacySource, row.legacyRowKey)),
  )
  const preview: PosLegacyImportPreview = {
    mode: data.mode,
    totalRows: data.rows.length,
    importableRows: pendingRows.length,
    duplicateRows: duplicates.length,
    duplicates,
  }
  if (data.mode === 'DRY_RUN') return apiOk(preview, POS_PRIVATE_RESPONSE)

  const verification = await verifyFreshSecondFactor({
    userId: access.user.id,
    code: data.verificationCode,
    method: data.verificationMethod,
  })
  if (!verification.verified) return apiError(verification.error, 403, {}, POS_PRIVATE_RESPONSE)
  try {
    const results = []
    for (const row of pendingRows) {
      results.push(
        await runPosMutation(
          'pos_import_legacy_row_v1',
          access.employee.id,
          importIdempotencyKey(row.legacySource, row.legacyRowKey),
          { ...row, freshFactorMethod: verification.method },
        ),
      )
    }
    return apiOk({ ...preview, results }, { status: 201, ...POS_PRIVATE_RESPONSE })
  } catch (importError) {
    return posErrorResponse(importError)
  }
}
