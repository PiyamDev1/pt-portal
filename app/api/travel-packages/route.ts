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

export async function GET(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const status = request.nextUrl.searchParams.get('status')
  let query = supabase
    .from('travel_packages')
    .select(selectTravelPackageColumns())
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  } else {
    query = query.neq('status', 'archived')
  }

  const { data, error } = await query

  if (error) {
    if (isPackageFolderSchemaError(error)) {
      return apiOk({ packages: [], setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load travel packages', 500)
  }

  return apiOk({ packages: (data || []) as unknown as TravelPackageFolder[], setupRequired: false })
}
