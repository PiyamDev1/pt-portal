import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type { TravelPackageFolder } from '@/app/types/packages'

const SCHEMA_HINT =
  'Travel package folder schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_folders.sql in Supabase SQL editor.'

function isPackageFolderSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
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
    return_date,
    departure_date,
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_packages')
    .select(selectTravelPackageColumns())
    .eq('id', id)
    .single()

  if (error) {
    if (isPackageFolderSchemaError(error)) {
      return apiOk({ package: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Travel package not found', 404)
  }

  return apiOk({ package: data as unknown as TravelPackageFolder, setupRequired: false })
}
