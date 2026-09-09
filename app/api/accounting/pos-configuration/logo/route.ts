import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { apiError, apiOk } from '@/lib/api/http'
import { parseMultipartFormDataWithLimit } from '@/lib/api/request'
import { requireAccountingAccess } from '@/lib/accounting/access'
import { isUploadedFile, validateImageUpload } from '@/lib/documentSecurity'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { POS_PRIVATE_RESPONSE } from '@/lib/pos/http'
import { POS_CONFIGURATION_CAPABILITY_VERSION } from '@/lib/pos/schemaCapability'
import { getPosSchemaStatus } from '@/lib/pos/server'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_INPUT_BYTES = 5 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_INPUT_BYTES + 256 * 1024
const MAX_OUTPUT_BYTES = 256 * 1024

async function optimizeLogo(input: Buffer) {
  const attempts = [
    { width: 512, height: 256, quality: 78 },
    { width: 384, height: 192, quality: 62 },
  ]

  for (const attempt of attempts) {
    const result = await sharp(input, { failOn: 'error', limitInputPixels: 25_000_000 })
      .rotate()
      .resize({
        width: attempt.width,
        height: attempt.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: attempt.quality, alphaQuality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    if (result.data.byteLength <= MAX_OUTPUT_BYTES) return result
  }

  throw new Error('OPTIMIZED_LOGO_TOO_LARGE')
}

export async function POST(request: NextRequest) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'accounting.pos-logo-upload',
    limit: 20,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  try {
    const capability = await getPosSchemaStatus()
    if (!capability.ready || capability.version < POS_CONFIGURATION_CAPABILITY_VERSION) {
      return apiError(
        'The POS configuration workspace database upgrade is not installed yet.',
        503,
        { requiredCapabilityVersion: POS_CONFIGURATION_CAPABILITY_VERSION },
        POS_PRIVATE_RESPONSE,
      )
    }

    const parsed = await parseMultipartFormDataWithLimit(request, MAX_MULTIPART_BYTES)
    if (!parsed.data) return apiError(parsed.error, parsed.status, {}, POS_PRIVATE_RESPONSE)
    const file = parsed.data.get('file')
    if (!isUploadedFile(file))
      return apiError('Logo image is required.', 400, {}, POS_PRIVATE_RESPONSE)

    const input = Buffer.from(await file.arrayBuffer())
    const validation = validateImageUpload(file, input, {
      maxBytes: MAX_INPUT_BYTES,
      maxSizeLabel: '5 MB',
    })
    if (!validation.valid)
      return apiError(validation.error, validation.status, {}, POS_PRIVATE_RESPONSE)

    let optimized: Awaited<ReturnType<typeof optimizeLogo>>
    try {
      optimized = await optimizeLogo(input)
    } catch (error) {
      if (error instanceof Error && error.message === 'OPTIMIZED_LOGO_TOO_LARGE') {
        return apiError(
          'The optimized logo is still too complex. Choose a simpler image.',
          422,
          {},
          POS_PRIVATE_RESPONSE,
        )
      }
      throw error
    }

    const logoKey = `custom-${crypto.randomUUID()}`
    const storageKey = `pos-logos/${logoKey}.webp`
    let storageProvider: 'minio' | 'r2' = 'minio'
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: storageKey,
          Body: optimized.data,
          ContentLength: optimized.data.byteLength,
          ContentType: 'image/webp',
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      )
    } catch (minioError) {
      if (!isR2Configured()) throw minioError
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: storageKey,
          Body: optimized.data,
          ContentLength: optimized.data.byteLength,
          ContentType: 'image/webp',
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      )
      storageProvider = 'r2'
    }

    return apiOk(
      {
        logoKey,
        logoUrl: `data:image/webp;base64,${optimized.data.toString('base64')}`,
        storageProvider,
        originalBytes: input.byteLength,
        storedBytes: optimized.data.byteLength,
        width: optimized.info.width,
        height: optimized.info.height,
        format: 'webp',
      },
      POS_PRIVATE_RESPONSE,
    )
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'pos.configuration_logo_upload_failed',
      request,
      error,
      context: { userId: access.user.id },
    })
    return responseWithRequestId(
      apiError('Logo upload is temporarily unavailable.', 503, {}, POS_PRIVATE_RESPONSE),
      requestId,
    )
  }
}
