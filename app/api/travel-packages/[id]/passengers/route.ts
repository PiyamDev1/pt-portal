import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackagePassenger, TravelPackagePassengerType } from '@/app/types/packages'
import { selectTravelPackagePassengerColumns } from './columns'

const SCHEMA_HINT =
  'Passenger tracking is incomplete. Run the package workflow migrations, including scripts/migrations/20260827_create_group_customer_files.sql.'
const PASSENGER_TYPES = new Set<TravelPackagePassengerType>(['adult', 'child', 'infant'])

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
  const quoteId = cleanText(body.quoteId || body.quote_id) || null
  const groupMemberId = cleanText(body.groupMemberId || body.group_member_id) || null
  if (Boolean(quoteId) !== Boolean(groupMemberId)) {
    return apiError('Choose both a family quotation and its group member', 400)
  }
  if (quoteId && groupMemberId) {
    const { data: packageRow, error: packageError } = await supabase
      .from('travel_packages')
      .select('group_id, customer_file_mode')
      .eq('id', id)
      .single()
    if (packageError || !packageRow || packageRow.customer_file_mode !== 'group') {
      return apiError('Family passengers can only be assigned inside a group customer file', 400)
    }
    const { data: familyMember, error: familyError } = await supabase
      .from('travel_package_group_members')
      .select('id')
      .eq('id', groupMemberId)
      .eq('group_id', packageRow.group_id)
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (familyError || !familyMember) {
      return apiError('The selected family does not belong to this group customer file', 400)
    }
  }

  const { data, error } = await supabase
    .from('travel_package_passengers')
    .insert({
      package_id: id,
      quote_id: quoteId,
      group_member_id: groupMemberId,
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
      quoteId,
      actorId: user.id,
      eventType: 'passenger_created',
      eventSummary: 'Passenger record added.',
      afterData: data,
    },
  )
  return apiOk({ passenger: data as unknown as TravelPackagePassenger }, { status: 201 })
}
