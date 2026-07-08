import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  isPackageQuoteExpired,
  normalizePackageExpiry,
  normalizePackageQuotePayload,
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

async function requireUser() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_quotes')
    .select(selectPackageColumns())
    .eq('id', id)
    .single()

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ quote: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Package quote not found', 404)
  }

  return apiOk({ quote: data as unknown as TravelPackageQuote, setupRequired: false })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as {
    payload?: unknown
    expiresAt?: unknown
    shareEnabled?: boolean
    status?: string
  } | null

  if (!body) return apiError('Invalid request payload', 400)

  const updates: Record<string, unknown> = {}

  if (body.payload !== undefined) {
    const payload = normalizePackageQuotePayload(body.payload)
    updates.title = payload.title
    updates.package_type = payload.packageType
    updates.currency = payload.currency
    updates.customer_name = payload.customerName || null
    updates.customer_phone = payload.customerPhone || null
    updates.customer_email = payload.customerEmail || null
    updates.payload = payload
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = normalizePackageExpiry(body.expiresAt)
    if (body.shareEnabled !== false && isPackageQuoteExpired(expiresAt)) {
      return apiError('Package quote expiry must be in the future', 400)
    }
    updates.expires_at = expiresAt
  }

  if (body.status !== undefined) {
    if (!['draft', 'shared', 'archived'].includes(body.status)) {
      return apiError('status must be draft, shared, or archived', 400)
    }
    updates.status = body.status
  }

  if (body.shareEnabled !== undefined) {
    if (body.shareEnabled) {
      const shareExpiry = String(updates.expires_at || normalizePackageExpiry(undefined))
      if (isPackageQuoteExpired(shareExpiry)) {
        return apiError('Package quote expiry must be in the future', 400)
      }
      updates.expires_at = shareExpiry
    }
    updates.share_enabled = body.shareEnabled
    updates.status = body.shareEnabled ? 'shared' : updates.status || 'draft'
    updates.shared_at = body.shareEnabled ? new Date().toISOString() : null
  }

  if (Object.keys(updates).length === 0) {
    return apiError('No fields provided to update', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_quotes')
    .update(updates)
    .eq('id', id)
    .select(selectPackageColumns())
    .single()

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ quote: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to update package quote', 500)
  }

  return apiOk({ quote: data as unknown as TravelPackageQuote, setupRequired: false })
}
