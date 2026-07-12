import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackagePassenger } from '@/app/types/packages'
import { selectTravelPackagePassengerColumns } from '../route'

const VISA_STATUSES = new Set([
  'not_started',
  'details_required',
  'submitted',
  'approved',
  'rejected',
  'not_required',
])
const TICKET_STATUSES = new Set(['not_started', 'held', 'ticketed', 'changed', 'cancelled'])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const { data: before } = await supabase
    .from('travel_package_passengers')
    .select(selectTravelPackagePassengerColumns())
    .eq('id', passengerId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Passenger not found', 404)

  const update: Record<string, unknown> = { updated_by: user.id }
  const textFields: Array<[string, string, string]> = [
    ['firstName', 'first_name', 'first_name'],
    ['lastName', 'last_name', 'last_name'],
    ['dateOfBirth', 'date_of_birth', 'date_of_birth'],
    ['passportIssueNote', 'passport_issue_note', 'passport_issue_note'],
    ['roomAllocation', 'room_allocation', 'room_allocation'],
    ['internalNotes', 'internal_notes', 'internal_notes'],
  ]
  textFields.forEach(([camel, snake, column]) => {
    if (
      Object.prototype.hasOwnProperty.call(body, camel) ||
      Object.prototype.hasOwnProperty.call(body, snake)
    ) {
      update[column] = cleanText(body[camel] ?? body[snake]) || null
    }
  })
  if ('passportReceived' in body || 'passport_received' in body) {
    update.passport_received = Boolean(body.passportReceived ?? body.passport_received)
  }
  if ('passportChecked' in body || 'passport_checked' in body) {
    update.passport_checked = Boolean(body.passportChecked ?? body.passport_checked)
  }
  if ('visaStatus' in body || 'visa_status' in body) {
    const status = cleanText(body.visaStatus ?? body.visa_status)
    if (!VISA_STATUSES.has(status)) return apiError('Invalid visa status', 400)
    update.visa_status = status
  }
  if ('ticketStatus' in body || 'ticket_status' in body) {
    const status = cleanText(body.ticketStatus ?? body.ticket_status)
    if (!TICKET_STATUSES.has(status)) return apiError('Invalid ticket status', 400)
    update.ticket_status = status
  }

  const { data, error } = await supabase
    .from('travel_package_passengers')
    .update(update)
    .eq('id', passengerId)
    .eq('package_id', id)
    .select(selectTravelPackagePassengerColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to update passenger', 500)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'passenger_updated',
      eventSummary: 'Passenger record updated.',
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ passenger: data as unknown as TravelPackagePassenger })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; passengerId: string }> },
) {
  const { id, passengerId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data: before } = await supabase
    .from('travel_package_passengers')
    .select(selectTravelPackagePassengerColumns())
    .eq('id', passengerId)
    .eq('package_id', id)
    .single()
  const { error } = await supabase
    .from('travel_package_passengers')
    .delete()
    .eq('id', passengerId)
    .eq('package_id', id)
  if (error) return apiError(error.message || 'Failed to delete passenger', 500)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'passenger_deleted',
      eventSummary: 'Passenger record deleted.',
      beforeData: before,
    },
  )
  return apiOk({ deleted: true })
}
