import { NextRequest, NextResponse } from 'next/server'
import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'

/**
 * GET /api/documents/status
 * Authenticated check using HeadBucketCommand — verifies the bucket is reachable.
 * Also ensures CORS is configured so direct browser PUT uploads can succeed.
 */
export async function GET(request: NextRequest) {
  const status = await getDocumentStorageStatus({ runMaintenance: true })

  return NextResponse.json({
    success: true,
    status,
  })
}
