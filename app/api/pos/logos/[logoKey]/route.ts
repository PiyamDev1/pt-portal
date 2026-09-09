import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { validateImageBytes } from '@/lib/documentSecurity'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { POS_PRIVATE_RESPONSE } from '@/lib/pos/http'
import { isCustomPosLogoKey } from '@/lib/pos/logos'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_LOGO_BYTES = 256 * 1024

export async function GET(request: NextRequest, context: { params: Promise<{ logoKey: string }> }) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const { logoKey } = await context.params
  if (!isCustomPosLogoKey(logoKey))
    return apiError('Invalid POS logo.', 400, {}, POS_PRIVATE_RESPONSE)

  try {
    const service = getServiceSupabaseClient()
    const [catalogue, supplier] = await Promise.all([
      service
        .from('pos_catalogue_items')
        .select('id')
        .eq('logo_key', logoKey)
        .limit(1)
        .maybeSingle(),
      service
        .from('pos_supplier_profiles')
        .select('supplier_vendor_id')
        .eq('logo_key', logoKey)
        .limit(1)
        .maybeSingle(),
    ])
    if (catalogue.error) throw catalogue.error
    if (supplier.error) throw supplier.error
    if (!catalogue.data && !supplier.data)
      return apiError('POS logo not found.', 404, {}, POS_PRIVATE_RESPONSE)

    const storageKey = `pos-logos/${logoKey}.webp`
    let result
    try {
      result = await getS3Client().send(
        new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: storageKey }),
      )
    } catch (minioError) {
      if (!isR2Configured()) throw minioError
      result = await getR2Client().send(
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }),
      )
    }
    if (!result.Body) return apiError('POS logo not found.', 404, {}, POS_PRIVATE_RESPONSE)
    if (result.ContentLength && result.ContentLength > MAX_LOGO_BYTES) {
      return apiError('Stored POS logo is invalid.', 415, {}, POS_PRIVATE_RESPONSE)
    }

    const bytes = await result.Body.transformToByteArray()
    const validation = validateImageBytes(bytes, result.ContentType, {
      maxBytes: MAX_LOGO_BYTES,
      maxSizeLabel: '256 KB',
    })
    if (!validation.valid || validation.value.fileType !== 'image/webp') {
      return apiError('Stored POS logo is invalid.', 415, {}, POS_PRIVATE_RESPONSE)
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'pos.logo_read_failed',
      request,
      error,
      context: { userId: access.user.id, logoKey },
    })
    return responseWithRequestId(
      apiError('POS logo is temporarily unavailable.', 502, {}, POS_PRIVATE_RESPONSE),
      requestId,
    )
  }
}
