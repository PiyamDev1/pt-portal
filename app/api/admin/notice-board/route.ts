import { createClient } from '@supabase/supabase-js'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import {
  logServerEvent,
  reportOperationalError,
  responseWithRequestId,
} from '@/lib/observability/server'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

const optionalWebUrl = z
  .string()
  .trim()
  .max(1_000)
  .refine((value) => {
    if (!value) return true
    if (value.startsWith('/')) return !value.startsWith('//')
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, 'URL must use http, https, or an internal portal path')

const optionalUuid = z.union([z.literal(''), z.string().uuid()])

const slideFields = {
  title: z.string().max(120).default(''),
  body: z.string().max(500).default(''),
  image_url: optionalWebUrl.default(''),
  image_storage_provider: z.union([z.literal(''), z.enum(['minio', 'r2'])]).default(''),
  image_storage_bucket: z.string().max(200).default(''),
  image_storage_key: z.string().max(1_000).default(''),
  hyperlink_url: optionalWebUrl.default(''),
  display_seconds: z.number().finite().min(2).max(60).default(6),
  sort_order: z.number().finite().min(-100_000).max(100_000).default(0),
  is_active: z.boolean().default(true),
  target_role: z.string().max(120).default(''),
  target_department_id: optionalUuid.default(''),
  target_location_id: optionalUuid.default(''),
}

function validateSlideFields(
  value: z.infer<z.ZodObject<typeof slideFields>>,
  context: z.RefinementCtx,
) {
  if (!value.title.trim() && !value.body.trim() && !value.image_url.trim()) {
    context.addIssue({
      code: 'custom',
      message: 'Add a title, message, or image',
    })
  }

  const storageValues = [
    value.image_storage_provider,
    value.image_storage_bucket,
    value.image_storage_key,
  ]
  const populatedStorageValues = storageValues.filter((item) => item.trim()).length
  if (populatedStorageValues > 0 && populatedStorageValues < storageValues.length) {
    context.addIssue({
      code: 'custom',
      message: 'Stored images require provider, bucket, and key metadata',
    })
  }
  if (value.image_storage_key && !value.image_storage_key.startsWith('notice-board/')) {
    context.addIssue({ code: 'custom', message: 'Invalid notice image storage key' })
  }
}

const createSlideSchema = z.object(slideFields).strict().superRefine(validateSlideFields)
const updateSlideSchema = z
  .object({ id: z.string().trim().min(1).max(200), ...slideFields })
  .strict()
  .superRefine(validateSlideFields)
const deleteSlideSchema = z.object({ id: z.string().trim().min(1).max(200) }).strict()

async function enforceMutationLimit(request: Request, userId: string) {
  return enforceRateLimit(request, {
    scope: 'admin.notice-board-mutate',
    limit: 30,
    windowSeconds: 60 * 60,
    identities: [`user:${userId}`, `ip:${getClientIp(request)}`],
  })
}

function sanitizeUuid(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function sanitizeSlide(input: Record<string, unknown>, userId?: string) {
  const cleanText = (value: unknown, maxLength: number) => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().slice(0, maxLength)
    return trimmed || null
  }

  return {
    title: cleanText(input.title, 120),
    body: cleanText(input.body, 500),
    image_url: cleanText(input.image_url, 1000),
    image_storage_provider: cleanText(input.image_storage_provider, 40),
    image_storage_bucket: cleanText(input.image_storage_bucket, 200),
    image_storage_key: cleanText(input.image_storage_key, 1000),
    hyperlink_url: cleanText(input.hyperlink_url, 1000),
    display_seconds: Math.min(Math.max(Number(input.display_seconds) || 6, 2), 60),
    sort_order: Number(input.sort_order) || 0,
    is_active: input.is_active !== false,
    target_role: cleanText(input.target_role, 120),
    target_department_id: sanitizeUuid(input.target_department_id),
    target_location_id: sanitizeUuid(input.target_location_id),
    ...(userId ? { created_by: userId } : {}),
    updated_at: new Date().toISOString(),
  }
}

type StoredImageReference = {
  image_storage_provider: string | null
  image_storage_bucket: string | null
  image_storage_key: string | null
}

async function deleteStoredImage(reference: StoredImageReference | null, request: Request) {
  if (!reference?.image_storage_key) return

  const isMinio =
    reference.image_storage_provider === 'minio' && reference.image_storage_bucket === MINIO_BUCKET
  const isR2 =
    reference.image_storage_provider === 'r2' &&
    reference.image_storage_bucket === R2_BUCKET &&
    isR2Configured()
  if (!isMinio && !isR2) return

  try {
    const client = isR2 ? getR2Client() : getS3Client()
    await client.send(
      new DeleteObjectCommand({
        Bucket: reference.image_storage_bucket || undefined,
        Key: reference.image_storage_key,
      }),
    )
  } catch (error) {
    logServerEvent({
      event: 'notice_board.image_cleanup_failed',
      level: 'warn',
      request,
      error,
      context: { provider: reference.image_storage_provider },
    })
  }
}

async function databaseFailure(
  request: Request,
  error: { code?: string; message?: string },
  event: string,
) {
  if (error.code === '23503') {
    return apiError('The selected role, department, or branch is no longer available', 409)
  }
  if (error.code === 'PGRST116') return apiError('Notice not found', 404)

  const requestId = await reportOperationalError({ event, request, error })
  return responseWithRequestId(apiError('Unable to save notice-board changes', 500), requestId)
}

export async function GET() {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('notice_board_slides')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    const requestId = await reportOperationalError({
      event: 'notice_board.list_failed',
      error,
    })
    return responseWithRequestId(apiError('Unable to load notice-board slides', 500), requestId)
  }

  const slideIds = (data || []).map((slide) => slide.id)
  const { data: reads, error: readsError } = slideIds.length
    ? await admin
        .from('notice_board_slide_reads')
        .select('slide_id, dismissed_at')
        .in('slide_id', slideIds)
    : { data: [], error: null }

  if (readsError) {
    const requestId = await reportOperationalError({
      event: 'notice_board.metrics_failed',
      error: readsError,
    })
    return responseWithRequestId(apiError('Unable to load notice-board metrics', 500), requestId)
  }

  const metrics = new Map<string, { seen_count: number; dismissed_count: number }>()
  for (const row of reads || []) {
    const current = metrics.get(row.slide_id) || { seen_count: 0, dismissed_count: 0 }
    current.seen_count += 1
    if (row.dismissed_at) current.dismissed_count += 1
    metrics.set(row.slide_id, current)
  }

  const slides = (data || []).map((slide) => ({
    ...slide,
    seen_count: metrics.get(slide.id)?.seen_count || 0,
    dismissed_count: metrics.get(slide.id)?.dismissed_count || 0,
  }))

  return apiOk({ slides })
}

export async function POST(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceMutationLimit(request, access.user.id)
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, createSlideSchema, {
    maxBytes: 16 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
  const { data, error } = await getAdminClient()
    .from('notice_board_slides')
    .insert(sanitizeSlide(body, access.user.id))
    .select('*')
    .single()

  if (error) return databaseFailure(request, error, 'notice_board.create_failed')
  return apiOk({ slide: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceMutationLimit(request, access.user.id)
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, updateSlideSchema, {
    maxBytes: 16 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

  const admin = getAdminClient()
  const { data: previousSlide } = await admin
    .from('notice_board_slides')
    .select('image_storage_provider, image_storage_bucket, image_storage_key')
    .eq('id', body.id)
    .maybeSingle()

  const { data, error } = await admin
    .from('notice_board_slides')
    .update(sanitizeSlide(body))
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return databaseFailure(request, error, 'notice_board.update_failed')
  if (!data) return apiError('Notice not found', 404)

  if (
    previousSlide?.image_storage_key &&
    previousSlide.image_storage_key !== data.image_storage_key
  ) {
    await deleteStoredImage(previousSlide, request)
  }
  return apiOk({ slide: data })
}

export async function DELETE(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceMutationLimit(request, access.user.id)
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, deleteSlideSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

  const { data: deletedSlide, error } = await getAdminClient()
    .from('notice_board_slides')
    .delete()
    .eq('id', body.id)
    .select('image_storage_provider, image_storage_bucket, image_storage_key')
    .maybeSingle()
  if (error) return databaseFailure(request, error, 'notice_board.delete_failed')

  await deleteStoredImage(deletedSlide, request)
  return apiOk({ ok: true })
}
