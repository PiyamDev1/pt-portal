/**
 * Authenticated notice board image proxy.
 *
 * The route verifies the staff session, resolves the object reference from a saved slide,
 * and streams the image through the portal. Browser-supplied bucket/provider values are
 * never trusted and the object-store endpoint does not need to be browser-accessible.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { validateImageBytes } from '@/lib/documentSecurity'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const key = request.nextUrl.searchParams.get('key')
  if (!key) return apiError('Notice image key is required', 400)
  if (key.length > 1_000 || !key.startsWith('notice-board/')) {
    return apiError('Invalid notice image key', 400)
  }

  try {
    const { data: slide, error } = await getServiceSupabaseClient()
      .from('notice_board_slides')
      .select('image_storage_provider, image_storage_bucket, image_storage_key')
      .eq('image_storage_key', key)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!slide) return apiError('Notice image not found', 404)

    const provider = slide.image_storage_provider
    const bucket = slide.image_storage_bucket
    const validMinioReference = provider === 'minio' && bucket === MINIO_BUCKET
    const validR2Reference = provider === 'r2' && bucket === R2_BUCKET && isR2Configured()

    if (!validMinioReference && !validR2Reference) {
      return apiError('Notice image storage reference is invalid', 404)
    }

    const client = validR2Reference ? getR2Client() : getS3Client()
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.Body) return apiError('Notice image not found', 404)
    if (result.ContentLength && result.ContentLength > MAX_IMAGE_BYTES) {
      return apiError('Notice image is too large', 413)
    }

    const bytes = await result.Body.transformToByteArray()
    const validation = validateImageBytes(bytes, result.ContentType, {
      maxBytes: MAX_IMAGE_BYTES,
      maxSizeLabel: '5 MB',
    })
    if (!validation.valid) return apiError('Stored notice image is invalid', 415)

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': validation.value.fileType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'notice_board.image_read_failed',
      request,
      error,
      context: { userId: access.user.id },
    })
    return responseWithRequestId(
      apiError('Notice image is temporarily unavailable', 502),
      requestId,
    )
  }
}
