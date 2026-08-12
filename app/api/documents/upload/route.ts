/**
 * API Route: Generate Secure Upload Link
 * Endpoint: POST /api/documents/upload
 */

import { NextRequest } from 'next/server'
import { apiError } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'

export async function POST(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  return apiError(
    'Presigned uploads are disabled. Use POST /api/documents/upload-direct so file content can be verified.',
    410,
  )
}
