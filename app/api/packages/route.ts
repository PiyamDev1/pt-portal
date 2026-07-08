import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  createPackageShareToken,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  normalizePackageExpiry,
} from '@/lib/packageQuote'
import type { TravelPackageQuote } from '@/app/types/packages'

const SCHEMA_HINT =
  'Package quote schema is not installed yet. Run scripts/migrations/20260708_create_travel_package_quotes.sql in Supabase SQL editor.'

function isPackageSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function selectPackageColumns() {
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
    created_by,
    created_at,
    updated_at
  `
}

export async function GET(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const status = request.nextUrl.searchParams.get('status')
  let query = supabase
    .from('travel_package_quotes')
    .select(selectPackageColumns())
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  } else {
    query = query.neq('status', 'archived')
  }

  const { data, error } = await query

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ packages: [], setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load package quotes', 500)
  }

  return apiOk({ packages: (data || []) as unknown as TravelPackageQuote[], setupRequired: false })
}

export async function POST(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const payload = normalizePackageQuotePayload((body as { payload?: unknown } | null)?.payload)
  const shareEnabled = Boolean((body as { shareEnabled?: unknown } | null)?.shareEnabled)
  const expiresAt = normalizePackageExpiry((body as { expiresAt?: unknown } | null)?.expiresAt)

  if (shareEnabled && isPackageQuoteExpired(expiresAt)) {
    return apiError('Package quote expiry must be in the future', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_quotes')
    .insert({
      title: payload.title,
      package_type: payload.packageType,
      status: shareEnabled ? 'shared' : 'draft',
      currency: payload.currency,
      customer_name: payload.customerName || null,
      customer_phone: payload.customerPhone || null,
      customer_email: payload.customerEmail || null,
      payload,
      created_by: user.id,
      share_token: createPackageShareToken(),
      share_enabled: shareEnabled,
      shared_at: shareEnabled ? new Date().toISOString() : null,
      expires_at: expiresAt,
    })
    .select(selectPackageColumns())
    .single()

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ quote: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to create package quote', 500)
  }

  return apiOk({ quote: data as unknown as TravelPackageQuote, setupRequired: false }, { status: 201 })
}
