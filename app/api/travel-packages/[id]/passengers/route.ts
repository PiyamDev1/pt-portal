import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackagePassenger, TravelPackagePassengerType } from '@/app/types/packages'

const SCHEMA_HINT =
  'Passenger tracking is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql, scripts/migrations/20260712_create_travel_package_invoices.sql, then scripts/migrations/20260712_finalize_travel_package_workflow.sql.'
const PASSENGER_TYPES = new Set<TravelPackagePassengerType>(['adult', 'child', 'infant'])

export function selectTravelPackagePassengerColumns() {
  return `
    id, package_id, first_name, last_name, date_of_birth, passenger_type,
    passport_received, passport_checked, passport_issue_note, visa_status,
    ticket_status, room_allocation, internal_notes, created_by, updated_by,
    created_at, updated_at
  `
}

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703'
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
    .from('travel_package_passengers')
    .select(selectTravelPackagePassengerColumns())
    .eq('package_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    if (isSchemaError(error))
      return apiOk({ passengers: [], setupRequired: true, message: SCHEMA_HINT })
    return apiError(error.message || 'Failed to load passengers', 500)
  }
  return apiOk({ passengers: (data || []) as unknown as TravelPackagePassenger[] })
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
  const passengerType = cleanText(
    body.passengerType || body.passenger_type,
  ) as TravelPackagePassengerType
  if (!PASSENGER_TYPES.has(passengerType)) return apiError('Invalid passenger type', 400)

  const { data, error } = await supabase
    .from('travel_package_passengers')
    .insert({
      package_id: id,
      first_name: cleanText(body.firstName || body.first_name) || null,
      last_name: cleanText(body.lastName || body.last_name) || null,
      date_of_birth: cleanText(body.dateOfBirth || body.date_of_birth) || null,
      passenger_type: passengerType,
      passport_received: Boolean(body.passportReceived || body.passport_received),
      passport_checked: Boolean(body.passportChecked || body.passport_checked),
      passport_issue_note: cleanText(body.passportIssueNote || body.passport_issue_note) || null,
      room_allocation: cleanText(body.roomAllocation || body.room_allocation) || null,
      internal_notes: cleanText(body.internalNotes || body.internal_notes) || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(selectTravelPackagePassengerColumns())
    .single()

  if (error || !data) {
    if (isSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to create passenger', 500)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'passenger_created',
      eventSummary: 'Passenger record added.',
      afterData: data,
    },
  )
  return apiOk({ passenger: data as unknown as TravelPackagePassenger }, { status: 201 })
}
