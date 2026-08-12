import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const slideFields = {
  title: z.string().max(120),
  body: z.string().max(500),
  image_url: z.string().max(1_000),
  image_storage_provider: z.string().max(40),
  image_storage_bucket: z.string().max(200),
  image_storage_key: z.string().max(1_000),
  hyperlink_url: z.string().max(1_000),
  display_seconds: z.number().finite().min(2).max(60),
  sort_order: z.number().finite().min(-100_000).max(100_000),
  is_active: z.boolean(),
  target_role: z.string().max(120),
  target_department_id: z.string().max(200),
  target_location_id: z.string().max(200),
}

const createSlideSchema = z.object(slideFields).strict()
const updateSlideSchema = z
  .object({ id: z.string().trim().min(1).max(200), ...slideFields })
  .strict()
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

export async function GET() {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('notice_board_slides')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)

  const slideIds = (data || []).map((slide) => slide.id)
  const { data: reads, error: readsError } = slideIds.length
    ? await admin
        .from('notice_board_slide_reads')
        .select('slide_id, dismissed_at')
        .in('slide_id', slideIds)
    : { data: [], error: null }

  if (readsError) return apiError(readsError.message, 500)

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

  if (error) return apiError(error.message, 500)
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

  const { data, error } = await getAdminClient()
    .from('notice_board_slides')
    .update(sanitizeSlide(body))
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return apiError(error.message, 500)
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

  const { error } = await getAdminClient().from('notice_board_slides').delete().eq('id', body.id)
  if (error) return apiError(error.message, 500)
  return apiOk({ ok: true })
}
