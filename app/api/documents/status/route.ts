/**
 * Module: app/api/documents/status/route.ts
 * API route or server helper for documents/status/route.ts.
 */

import { NextRequest } from 'next/server'
import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { DOCUMENT_PRIVATE_CACHE_HEADERS } from '@/lib/documentSecurity'

/**
 * GET /api/documents/status
 * Authenticated status check that reports primary and fallback storage
 * reachability and capabilities. It may run one bounded fallback migration.
 */
export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const status = await getDocumentStorageStatus({ runMaintenance: true })
  return apiOk({ status }, { headers: DOCUMENT_PRIVATE_CACHE_HEADERS })
}
