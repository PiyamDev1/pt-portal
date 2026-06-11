import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const admin = getSupabaseClient()
  const { data, error } = await admin
    .from('user_passkeys')
    .select('id, name, transports, device_type, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)
  return apiOk({ passkeys: data || [] })
}

export async function DELETE(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await request.json().catch(() => ({})) as { id?: string }
  if (!body.id) return apiError('Passkey id is required', 400)

  const admin = getSupabaseClient()
  const { error } = await admin
    .from('user_passkeys')
    .delete()
    .eq('id', body.id)
    .eq('user_id', user.id)

  if (error) return apiError(error.message, 500)
  return apiOk({ ok: true })
}
