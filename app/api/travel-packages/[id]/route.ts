import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type { TravelPackageFolder, TravelPackageFolderStatus } from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import {
  canTransitionTravelPackageStatus,
  getLifecycleTimestampUpdate,
} from '@/lib/packageWorkflow'

const SCHEMA_HINT =
  'Travel package folder schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_folders.sql in Supabase SQL editor.'

function isPackageFolderSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

const PACKAGE_STATUSES = new Set<TravelPackageFolderStatus>([
  'selected',
  'awaiting_passports',
  'awaiting_deposit',
  'reservation_pending',
  'partially_booked',
  'fully_reserved',
  'documents_pending',
  'documents_released',
  'travelling_soon',
  'travelling',
  'returned',
  'closed',
  'cancelled',
  'archived',
])

const PASSPORT_STATUSES = new Set([
  'not_requested',
  'requested',
  'received_whatsapp',
  'checked',
  'issues_found',
  'ready',
])

export function selectTravelPackageColumns() {
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
    document_access_token,
    document_access_enabled,
    document_access_expires_at,
    document_access_last_viewed_at,
    customer_access_last_name,
    portal_access_created_at,
    travelled_at,
    returned_at,
    earned_at,
    cancellation_reason,
    metadata,
    created_at,
    updated_at,
    archived_at,
    closed_at
  `
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getCustomerLastName(customerName: string) {
  return customerName.trim().split(/\s+/).at(-1)?.toLowerCase() || null
}

async function parseBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
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

  const { data: existingData, error: existingError } = await supabase
    .from('travel_packages')
    .select(selectTravelPackageColumns())
    .eq('id', id)
    .single()

  if (existingError || !existingData) {
    if (isPackageFolderSchemaError(existingError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  const existing = existingData as unknown as TravelPackageFolder
  const update: Record<string, unknown> = {}

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanText(body.status) as TravelPackageFolderStatus
    if (!PACKAGE_STATUSES.has(status)) return apiError('Invalid package status', 400)
    if (!canTransitionTravelPackageStatus(existing.status, status)) {
      return apiError(`Cannot move package from ${existing.status} to ${status}`, 409)
    }
    if (status === 'cancelled' && !cleanText(body.cancellationReason) && !existing.cancellation_reason) {
      return apiError('A cancellation reason is required', 400)
    }
    update.status = status
    Object.assign(update, getLifecycleTimestampUpdate(status))
  }

  if (Object.prototype.hasOwnProperty.call(body, 'passportStatus')) {
    const passportStatus = cleanText(body.passportStatus)
    if (!PASSPORT_STATUSES.has(passportStatus)) return apiError('Invalid passport status', 400)
    update.passport_status = passportStatus
  }

  if (Object.prototype.hasOwnProperty.call(body, 'customerName')) {
    const customerName = cleanText(body.customerName)
    update.customer_name = customerName || null
    update.customer_access_last_name = getCustomerLastName(customerName)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'customerPhone')) {
    update.customer_phone = cleanText(body.customerPhone) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'customerEmail')) {
    update.customer_email = cleanText(body.customerEmail) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'destination')) {
    update.destination = cleanText(body.destination) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'departureDate')) {
    update.departure_date = cleanText(body.departureDate) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'returnDate')) {
    update.return_date = cleanText(body.returnDate) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'assignedAgentId')) {
    update.assigned_agent_id = cleanText(body.assignedAgentId) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'nextAction')) {
    update.next_action = cleanText(body.nextAction) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'nextActionDueAt')) {
    update.next_action_due_at = cleanText(body.nextActionDueAt) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'cancellationReason')) {
    update.cancellation_reason = cleanText(body.cancellationReason) || null
  }
  if (body.currentPublicSummary && typeof body.currentPublicSummary === 'object') {
    update.current_public_summary = body.currentPublicSummary
  }

  if (Object.keys(update).length === 0) return apiError('No package changes supplied', 400)

  const { data, error } = await supabase
    .from('travel_packages')
    .update(update)
    .eq('id', id)
    .select(selectTravelPackageColumns())
    .single()

  if (error || !data) {
    if (isPackageFolderSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to update travel package', 500)
  }

  const updated = data as unknown as TravelPackageFolder
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: existing.source_quote_id,
      actorId: user.id,
      eventType: existing.status !== updated.status ? 'package_status_changed' : 'package_updated',
      eventSummary:
        existing.status !== updated.status
          ? `Package status changed from ${existing.status} to ${updated.status}.`
          : 'Package details updated.',
      beforeData: existing,
      afterData: updated,
    },
  )

  return apiOk({ package: updated, setupRequired: false })
}
