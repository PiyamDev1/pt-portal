import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES,
  createPackageDocumentAccessToken,
  createPackageThirdPartyAccessCode,
  normalizeThirdPartyPackageDocumentCategories,
} from '@/lib/packageDocuments'
import {
  THIRD_PARTY_SHARE_TERMS,
  hashThirdPartyShareCode,
  hashThirdPartyShareToken,
} from '@/lib/packageThirdPartyShares'
import type { TravelPackageThirdPartyDocumentShare } from '@/app/types/packages'
import { isThirdPartyShareSchemaError, selectThirdPartyShareColumns } from './helpers'

const SCHEMA_HINT =
  'Third-party package document sharing is not installed yet. Run scripts/migrations/20260803_create_travel_package_third_party_document_shares.sql in Supabase SQL editor.'

function getDefaultExpiry() {
  const expiry = new Date()
  expiry.setUTCDate(expiry.getUTCDate() + 7)
  return expiry.toISOString()
}

function normalizeExpiry(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return getDefaultExpiry()
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null
  return date.toISOString()
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_third_party_document_shares')
    .select(selectThirdPartyShareColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return apiOk({
      shares: [],
      setupRequired: isThirdPartyShareSchemaError(error),
      message: isThirdPartyShareSchemaError(error)
        ? SCHEMA_HINT
        : error.message || 'Failed to load third-party document shares',
    })
  }

  return apiOk({
    shares: (data || []) as unknown as TravelPackageThirdPartyDocumentShare[],
    setupRequired: false,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const expiresAt = normalizeExpiry(body.expiresAt || body.expires_at)
  if (!expiresAt) return apiError('Expiry must be a valid future date and time', 400)

  const { data: packageFolder, error: packageError } = await supabase
    .from('travel_packages')
    .select('id')
    .eq('id', id)
    .single()

  if (packageError || !packageFolder) {
    if (isThirdPartyShareSchemaError(packageError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  const token = createPackageDocumentAccessToken()
  const accessCode = createPackageThirdPartyAccessCode()
  const allowedCategories = normalizeThirdPartyPackageDocumentCategories(body.allowedCategories)
  const label = cleanText(body.label) || 'Third-party document access'
  const recipientName = cleanText(body.recipientName || body.recipient_name) || null
  const purpose = cleanText(body.purpose) || null

  const { data, error } = await supabase
    .from('travel_package_third_party_document_shares')
    .insert({
      package_id: id,
      created_by: user.id,
      updated_by: user.id,
      label,
      recipient_name: recipientName,
      purpose,
      status: 'active',
      token_hash: hashThirdPartyShareToken(token),
      access_code_hash: hashThirdPartyShareCode(token, accessCode),
      access_code_hint: accessCode.slice(-2),
      allowed_categories: allowedCategories,
      expires_at: expiresAt,
      terms_text: THIRD_PARTY_SHARE_TERMS,
      metadata: {
        generatedForWhatsApp: true,
        defaultCategories:
          allowedCategories.length === THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES.length,
      },
    })
    .select(selectThirdPartyShareColumns())
    .single()

  if (error) {
    if (isThirdPartyShareSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to create third-party document share', 500)
  }

  const createdShare = data as unknown as TravelPackageThirdPartyDocumentShare

  await supabase.from('travel_package_third_party_access_events').insert({
    share_id: createdShare.id,
    package_id: id,
    event_type: 'created',
    actor_id: user.id,
    recipient_name: recipientName,
    metadata: { allowedCategories, label, purpose },
  })

  return apiOk(
    {
      share: createdShare,
      shareUrl: `${request.nextUrl.origin}/package-third-party-documents/${token}`,
      accessCode,
      setupRequired: false,
    },
    { status: 201 },
  )
}
