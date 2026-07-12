import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { createPackageDocumentAccessToken } from '@/lib/packageDocuments'

const SCHEMA_HINT =
  'Travel package document access schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql in Supabase SQL editor.'

function isDocumentSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function getDefaultExpiry() {
  const expiry = new Date()
  expiry.setUTCMonth(expiry.getUTCMonth() + 10)
  return expiry.toISOString()
}

function normalizeExpiry(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return getDefaultExpiry()
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (date.getTime() <= Date.now()) return null
  return date.toISOString()
}

async function parseBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await parseBody(request)
  if (!body) return apiError('Invalid JSON body', 400)

  const enabled = Boolean(body.enabled)
  const regenerate = Boolean(body.regenerate)
  const expiresAt = enabled ? normalizeExpiry(body.expiresAt) : null
  if (enabled && !expiresAt) {
    return apiError('Document portal expiry must be a valid future date and time', 400)
  }

  const { data: existing, error: existingError } = await supabase
    .from('travel_packages')
    .select('id, document_access_token, customer_name, customer_access_last_name')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    if (isDocumentSchemaError(existingError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  const currentToken = (existing as { document_access_token?: string | null }).document_access_token
  const customerName = String((existing as { customer_name?: string | null }).customer_name || '')
  const customerLastName = customerName.trim().split(/\s+/).at(-1)?.toLowerCase() || null
  const token = enabled
    ? regenerate || !currentToken
      ? createPackageDocumentAccessToken()
      : currentToken
    : currentToken

  const { data, error } = await supabase
    .from('travel_packages')
    .update({
      document_access_enabled: enabled,
      document_access_token: token,
      document_access_expires_at: expiresAt,
      document_release_status: enabled ? 'released' : 'revoked',
      customer_access_last_name:
        (existing as { customer_access_last_name?: string | null }).customer_access_last_name
        || customerLastName,
      portal_access_created_at: enabled ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select(
      'id, document_access_token, document_access_enabled, document_access_expires_at, document_release_status',
    )
    .single()

  if (error) {
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to update package document access', 500)
  }

  return apiOk({ access: data, setupRequired: false })
}
