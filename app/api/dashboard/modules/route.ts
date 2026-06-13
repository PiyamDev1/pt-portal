import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('dashboard_user_module_preferences')
    .select('module_id, is_favorite, usage_count, last_opened_at')
    .eq('user_id', user.id)

  if (error) return apiError(error.message, 500)
  return apiOk({ preferences: data || [] })
}

export async function POST(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => ({}))) as {
    moduleId?: string
    action?: 'toggle-favorite' | 'record-open'
    favorite?: boolean
  }

  if (!body.moduleId || !body.action) return apiError('moduleId and action required', 400)

  const { data: existing, error: existingError } = await supabase
    .from('dashboard_user_module_preferences')
    .select('module_id, is_favorite, usage_count, last_opened_at')
    .eq('user_id', user.id)
    .eq('module_id', body.moduleId)
    .maybeSingle()

  if (existingError) return apiError(existingError.message, 500)

  const now = new Date().toISOString()
  const nextRow = {
    user_id: user.id,
    module_id: body.moduleId,
    is_favorite:
      body.action === 'toggle-favorite'
        ? typeof body.favorite === 'boolean'
          ? body.favorite
          : !existing?.is_favorite
        : existing?.is_favorite || false,
    usage_count:
      body.action === 'record-open'
        ? Number(existing?.usage_count || 0) + 1
        : Number(existing?.usage_count || 0),
    last_opened_at: body.action === 'record-open' ? now : existing?.last_opened_at || null,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('dashboard_user_module_preferences')
    .upsert(nextRow, { onConflict: 'user_id,module_id' })
    .select('module_id, is_favorite, usage_count, last_opened_at')
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk({ preference: data })
}
