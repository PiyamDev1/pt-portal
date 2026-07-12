import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { normalizePackageDocumentCategory } from '@/lib/packageDocuments'
import type {
  TravelPackageDocument,
  TravelPackageDocumentStatus,
} from '@/app/types/packages'
import { selectTravelPackageDocumentColumns } from '../route'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Travel package document schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql in Supabase SQL editor.'

function isDocumentSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasBodyKey(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

async function syncDocumentReleaseStatus(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
) {
  const { count, error } = await supabase
    .from('travel_package_documents')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)
    .eq('customer_visible', true)
    .eq('status', 'released')

  if (error) return

  await supabase
    .from('travel_packages')
    .update({
      document_release_status: count && count > 0 ? 'released' : 'pending',
    })
    .eq('id', packageId)
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
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = await parseBody(request)
  if (!body) return apiError('Invalid JSON body', 400)

  const updatePayload: Record<string, unknown> = {
    updated_by: user.id,
  }

  if (hasBodyKey(body, 'title')) {
    const title = cleanText(body.title)
    if (!title) return apiError('Document title is required', 400)
    updatePayload.title = title
  }

  if (hasBodyKey(body, 'category')) {
    updatePayload.category = normalizePackageDocumentCategory(body.category)
  }

  if (hasBodyKey(body, 'publicNotes')) {
    updatePayload.public_notes = cleanText(body.publicNotes) || null
  }

  if (hasBodyKey(body, 'internalNotes')) {
    updatePayload.internal_notes = cleanText(body.internalNotes) || null
  }

  if (hasBodyKey(body, 'customerVisible')) {
    const visible = Boolean(body.customerVisible)
    updatePayload.customer_visible = visible
    updatePayload.status = visible ? 'released' : 'ready_for_review'
    updatePayload.released_at = visible ? new Date().toISOString() : null
    updatePayload.released_by = visible ? user.id : null
    updatePayload.revoked_at = visible ? null : new Date().toISOString()
    updatePayload.revoked_by = visible ? null : user.id
  }

  if (hasBodyKey(body, 'status')) {
    const status = cleanText(body.status) as TravelPackageDocumentStatus
    if (!['draft', 'ready_for_review', 'released', 'revoked', 'deleted'].includes(status)) {
      return apiError('Invalid document status', 400)
    }
    updatePayload.status = status
    if (status === 'released') {
      updatePayload.customer_visible = true
      updatePayload.released_at = new Date().toISOString()
      updatePayload.released_by = user.id
    }
    if (status === 'revoked') {
      updatePayload.customer_visible = false
      updatePayload.revoked_at = new Date().toISOString()
      updatePayload.revoked_by = user.id
    }
    if (status === 'deleted') {
      updatePayload.customer_visible = false
      updatePayload.deleted_at = new Date().toISOString()
    }
  }

  if (Object.keys(updatePayload).length === 1) {
    return apiError('No document updates supplied', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_documents')
    .update(updatePayload)
    .eq('id', documentId)
    .eq('package_id', id)
    .select(selectTravelPackageDocumentColumns())
    .single()

  if (error) {
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to update package document', 500)
  }

  await syncDocumentReleaseStatus(supabase, id)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: Boolean((data as { customer_visible?: boolean }).customer_visible)
        ? 'document_released'
        : 'document_updated',
      eventSummary: `Document "${(data as { title?: string }).title || documentId}" updated.`,
      afterData: data,
    },
  )

  return apiOk({
    document: data as unknown as TravelPackageDocument,
    setupRequired: false,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_documents')
    .update({
      status: 'deleted',
      customer_visible: false,
      updated_by: user.id,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('package_id', id)
    .select(selectTravelPackageDocumentColumns())
    .single()

  if (error) {
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to delete package document', 500)
  }

  await syncDocumentReleaseStatus(supabase, id)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'document_deleted',
      eventSummary: `Document "${(data as { title?: string }).title || documentId}" deleted.`,
      afterData: data,
    },
  )

  return apiOk({
    document: data as unknown as TravelPackageDocument,
    setupRequired: false,
  })
}
