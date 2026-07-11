import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  buildPackageSnapshot,
  buildPassengerSummary,
  createTravelPackageReference,
  getDefaultPackageNextAction,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'
import { getPackageMinioBucketName } from '@/lib/packageIntegrations'
import type { TravelPackageFolder, TravelPackageQuote } from '@/app/types/packages'

const SCHEMA_HINT =
  'Travel package folder schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_folders.sql in Supabase SQL editor.'

function isPackageSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function selectQuoteColumns() {
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

function selectTravelPackageColumns() {
  return `
    id,
    package_reference,
    source_quote_id,
    created_by,
    assigned_agent_id,
    location_id,
    customer_name,
    customer_phone,
    customer_email,
    package_type,
    destination,
    departure_date,
    return_date,
    status,
    passenger_summary,
    selected_quote_snapshot,
    current_public_summary,
    passport_status,
    payment_status,
    invoice_status,
    document_release_status,
    next_action,
    next_action_due_at,
    risk_level,
    minio_bucket,
    minio_prefix,
    created_at,
    updated_at,
    archived_at,
    closed_at
  `
}

function asDateOnly(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data: quoteData, error: quoteError } = await supabase
    .from('travel_package_quotes')
    .select(selectQuoteColumns())
    .eq('id', id)
    .single()

  if (quoteError || !quoteData) {
    if (isPackageSchemaError(quoteError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError('Package quote not found', 404)
  }

  const quote = quoteData as unknown as TravelPackageQuote
  if (quote.status === 'archived') {
    return apiError('Archived package quotes cannot be converted', 400)
  }
  if (!quote.selected_option || !quote.selected_at) {
    return apiError('Finalise a package option before converting this quote', 400)
  }

  if (quote.converted_package_id) {
    const { data: existingPackage, error: existingError } = await supabase
      .from('travel_packages')
      .select(selectTravelPackageColumns())
      .eq('id', quote.converted_package_id)
      .single()

    if (!existingError && existingPackage) {
      return apiOk({
        package: existingPackage as unknown as TravelPackageFolder,
        alreadyConverted: true,
      })
    }
  }

  const payload = normalizePackageQuotePayload(quote.payload)
  const reference = createTravelPackageReference()
  const snapshot = buildPackageSnapshot(quote)
  const passengerSummary = buildPassengerSummary(payload)
  const nextAction = getDefaultPackageNextAction(quote.selected_option)
  const minioBucket = getPackageMinioBucketName()
  const minioPrefix = `${reference}/`

  const { data: packageData, error: insertError } = await supabase
    .from('travel_packages')
    .insert({
      package_reference: reference,
      source_quote_id: quote.id,
      created_by: user.id,
      assigned_agent_id: user.id,
      customer_name:
        quote.selected_option.selection.customerName || quote.customer_name || payload.customerName || null,
      customer_phone:
        quote.selected_option.selection.customerPhone || quote.customer_phone || payload.customerPhone || null,
      customer_email:
        quote.selected_option.selection.customerEmail || quote.customer_email || payload.customerEmail || null,
      package_type: payload.packageType,
      destination:
        payload.packageType === 'umrah'
          ? 'Makkah / Madinah'
          : payload.packageType === 'ziyarat'
            ? 'Ziyarat'
            : 'Holiday',
      departure_date: asDateOnly(payload.departureDate),
      return_date: asDateOnly(payload.returnDate),
      status: 'selected',
      passenger_summary: passengerSummary,
      selected_quote_snapshot: snapshot,
      current_public_summary: {
        title: payload.title,
        totalPrice: quote.selected_option.combination.totalPrice,
        currency: quote.selected_option.combination.currency,
      },
      next_action: nextAction,
      risk_level: 'medium',
      minio_bucket: minioBucket,
      minio_prefix: minioPrefix,
    })
    .select(selectTravelPackageColumns())
    .single()

  if (insertError || !packageData) {
    if (isPackageSchemaError(insertError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError(insertError?.message || 'Failed to create package folder', 500)
  }

  const packageFolder = packageData as unknown as TravelPackageFolder

  await supabase
    .from('travel_package_tasks')
    .insert({
      package_id: packageFolder.id,
      quote_id: quote.id,
      title: nextAction,
      description: 'Initial package action after quote conversion.',
      task_type: 'passport_status',
      priority: 'high',
      assigned_to: user.id,
      auto_generated: true,
      source_rule: 'quote_converted',
    })

  await supabase
    .from('travel_package_communications')
    .insert({
      package_id: packageFolder.id,
      quote_id: quote.id,
      channel: 'internal',
      direction: 'internal',
      summary: 'Quote converted to package folder.',
      created_by: user.id,
    })

  await supabase
    .from('travel_package_versions')
    .insert({
      package_id: packageFolder.id,
      quote_id: quote.id,
      object_type: 'selected_quote',
      object_id: quote.id,
      version_number: 1,
      visibility: 'internal_only',
      snapshot,
      internal_change_summary: 'Initial finalised quote snapshot.',
      created_by: user.id,
    })

  await supabase
    .from('travel_package_quotes')
    .update({
      converted_package_id: packageFolder.id,
      converted_at: new Date().toISOString(),
    })
    .eq('id', quote.id)

  return apiOk({ package: packageFolder, alreadyConverted: false }, { status: 201 })
}
