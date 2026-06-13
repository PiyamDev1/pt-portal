/**
 * Notice board read/dismiss tracking.
 *
 * View events help admins understand reach. Dismiss events support the mobile
 * "don't show again today" flow without storing notice state in localStorage.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => ({}))) as {
    slideId?: string
    action?: 'seen' | 'dismissed'
  }

  if (!body.slideId) return apiError('slideId required', 400)

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
