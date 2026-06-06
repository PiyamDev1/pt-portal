/**
 * Module: app/api/documents/download-all/route.ts
 * DEPRECATED — superseded by the two-step ZIP system at /api/documents/zip
 */

import { NextRequest } from 'next/server'
import { apiError } from '@/lib/api/http'

export async function GET(_request: NextRequest) {
  return apiError(
    'This endpoint has been replaced. Use POST /api/documents/zip to create a ZIP archive, then GET /api/documents/zip?familyHeadId=<id> to check its status.',
    410,
  )
}
