import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { isPackageQuoteExpired } from '@/lib/packageQuote'
import type { TravelPackageQuote } from '@/app/types/packages'

function selectPublicPackageColumns() {
  return `
    id,
    title,
    package_type,
    status,
    currency,
    customer_name,
    customer_phone,
    customer_email,
    payload,
    share_token,
    share_enabled,
    shared_at,
    expires_at,
    selected_option,
    selected_at,
    selection_note,
    converted_package_id,
    converted_at,
    created_by,
    created_at,
    updated_at
  `
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing share token', 400)

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase
    .from('travel_package_quotes')
    .select(selectPublicPackageColumns())
    .eq('share_token', cleanToken)
    .eq('share_enabled', true)
    .neq('status', 'archived')
    .single()

  if (error || !data) {
    return apiError('Package quote not found or no longer available', 404)
  }

  const quote = data as unknown as TravelPackageQuote
  if (isPackageQuoteExpired(quote.expires_at)) {
    return apiError('This package quote has expired. Please contact your agent for an updated quote.', 410)
  }

  return apiOk({ quote })
}
