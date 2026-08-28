import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  markPackageQuoteSyncFailed,
  syncConvertedPackageFromQuotes,
} from '@/lib/packageQuoteSyncServer'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  try {
    const result = await syncConvertedPackageFromQuotes(supabase, {
      packageId: id,
      actorId: user.id,
      reason: 'Agent requested a full quotation-to-package reconciliation.',
    })
    return apiOk({ result })
  } catch (error) {
    await markPackageQuoteSyncFailed(supabase, id, error)
    return apiError(
      error instanceof Error ? error.message : 'Package quotation reconciliation failed',
      500,
    )
  }
}
