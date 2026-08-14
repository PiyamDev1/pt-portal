/**
 * Notice board read/dismiss tracking.
 *
 * View events help admins understand reach. Dismiss events support the mobile
 * "don't show again today" flow without storing notice state in localStorage.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const readSchema = z
  .object({
    slideId: z.string().uuid(),
    action: z.enum(['seen', 'dismissed']),
  })
  .strict()

export async function POST(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const limit = await enforceRateLimit(request, {
    scope: 'dashboard.notice-board-read',
    limit: 240,
    windowSeconds: 60 * 60,
    identities: [`user:${user.id}`, `ip:${getClientIp(request)}`],
    message: 'Too many notice-board updates. Please try again later.',
  })
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, readSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid notice-board update', 400)

  const now = new Date().toISOString()
  const readRow = {
    slide_id: body.slideId,
    user_id: user.id,
    last_seen_at: now,
    ...(body.action === 'dismissed' ? { dismissed_at: now } : {}),
  }

  const { error } = await supabase
    .from('notice_board_slide_reads')
    .upsert(readRow, { onConflict: 'slide_id,user_id' })

  if (error) return apiError(error.message, 500)
  return apiOk({ ok: true })
}
