import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type { TravelPackageThirdPartyDocumentShare } from '@/app/types/packages'
import { isThirdPartyShareSchemaError, selectThirdPartyShareColumns } from '../helpers'

const SCHEMA_HINT =
  'Third-party package document sharing is not installed yet. Run scripts/migrations/20260803_create_travel_package_third_party_document_shares.sql in Supabase SQL editor.'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  const { id, shareId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const status = body.status === 'revoked' ? 'revoked' : null
  if (!status) return apiError('Only revoke is supported for third-party shares', 400)

  const { data, error } = await supabase
    .from('travel_package_third_party_document_shares')
    .update({
      status,
      updated_by: user.id,
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
    })
    .eq('id', shareId)
    .eq('package_id', id)
    .select(selectThirdPartyShareColumns())
    .single()

  if (error || !data) {
    if (isThirdPartyShareSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to revoke third-party document share', 500)
  }

  await supabase.from('travel_package_third_party_access_events').insert({
    share_id: shareId,
    package_id: id,
    event_type: 'revoked',
    actor_id: user.id,
  })

  return apiOk({
    share: data as unknown as TravelPackageThirdPartyDocumentShare,
    setupRequired: false,
  })
}
