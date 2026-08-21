import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import type { TravelPackageGroup, TravelPackageGroupStatus } from '@/app/types/packages'
import {
  cleanPackageGroupText,
  isTravelPackageGroupSchemaError,
  selectTravelPackageGroupColumns,
  TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
  TRAVEL_PACKAGE_GROUP_STATUSES,
} from '@/lib/packageGroups'

type GroupsResponse = {
  groups: TravelPackageGroup[]
  setupRequired: boolean
  message?: string
}

const PACKAGE_GROUP_DELETE_ROLES = ['Admin', 'Master Admin', 'Super Admin']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BULK_GROUPS = 100
const MAX_BULK_BODY_BYTES = 16 * 1024

const bulkGroupUpdateSchema = z
  .object({
    ids: z.array(z.unknown()).max(MAX_BULK_GROUPS),
    action: z.unknown().optional(),
  })
  .passthrough()

const bulkGroupDeleteSchema = z
  .object({
    ids: z.array(z.unknown()).max(MAX_BULK_GROUPS),
  })
  .passthrough()

function cleanBoolean(value: unknown) {
  return value === true || value === 'true'
}

function cleanMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cleanGroupIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(cleanPackageGroupText).filter((id) => UUID_PATTERN.test(id)))].slice(
    0,
    MAX_BULK_GROUPS,
  )
}

async function getGroupIdsForMemberFilter(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  field: 'package_id' | 'quote_id',
  value: string,
) {
  const { data, error } = await supabase
    .from('travel_package_group_members')
    .select('group_id')
    .eq(field, value)

  if (error) throw error
  return [...new Set((data || []).map((item) => item.group_id).filter(Boolean))]
}

export async function GET(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const status = cleanPackageGroupText(request.nextUrl.searchParams.get('status'))
  const packageId = cleanPackageGroupText(request.nextUrl.searchParams.get('packageId'))
  const quoteId = cleanPackageGroupText(request.nextUrl.searchParams.get('quoteId'))

  try {
    let query = supabase
      .from('travel_package_groups')
      .select(selectTravelPackageGroupColumns())
      .order('created_at', { ascending: false })
      .limit(100)

    if (status && status !== 'all') {
      if (!TRAVEL_PACKAGE_GROUP_STATUSES.has(status as TravelPackageGroupStatus)) {
        return apiError('Invalid package group status', 400)
      }
      query = query.eq('status', status)
    } else if (status !== 'all') {
      query = query.neq('status', 'archived')
    }

    if (packageId || quoteId) {
      const groupIds = packageId
        ? await getGroupIdsForMemberFilter(supabase, 'package_id', packageId)
        : await getGroupIdsForMemberFilter(supabase, 'quote_id', quoteId)
      if (groupIds.length === 0) {
        return apiOk<GroupsResponse>({ groups: [], setupRequired: false })
      }
      query = query.in('id', groupIds)
    }

    const { data, error } = await query

    if (error) throw error

    return apiOk<GroupsResponse>({
      groups: (data || []) as unknown as TravelPackageGroup[],
      setupRequired: false,
    })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk<GroupsResponse>({
        groups: [],
        setupRequired: true,
        message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
      })
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to load package groups',
      500,
    )
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const { data: body } = await parseBodyWithSchema(request, bulkGroupUpdateSchema, {
    maxBytes: MAX_BULK_BODY_BYTES,
  })
  if (!body) return apiError('Invalid JSON body', 400)
  const ids = cleanGroupIds(body.ids)
  if (ids.length === 0) return apiError('Select at least one valid package group', 400)

  const action = cleanPackageGroupText(body.action)
  if (!['archive', 'restore'].includes(action)) {
    return apiError('Bulk action must be archive or restore', 400)
  }

  const status: TravelPackageGroupStatus = action === 'archive' ? 'archived' : 'active'
  const supabase = await getRouteSupabaseClient()
  try {
    const { data, error } = await supabase
      .from('travel_package_groups')
      .update({
        status,
        archived_at: status === 'archived' ? new Date().toISOString() : null,
        updated_by: access.user.id,
      })
      .in('id', ids)
      .select(selectTravelPackageGroupColumns())

    if (error) throw error
    return apiOk({ groups: data || [], updatedCount: data?.length || 0 })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          groups: [],
          updatedCount: 0,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to update package groups',
      500,
    )
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireStaffSession({ roles: PACKAGE_GROUP_DELETE_ROLES })
  if (!access.authorized) return access.response

  const { data: body } = await parseBodyWithSchema(request, bulkGroupDeleteSchema, {
    maxBytes: MAX_BULK_BODY_BYTES,
  })
  if (!body) return apiError('Invalid JSON body', 400)
  const ids = cleanGroupIds(body.ids)
  if (ids.length === 0) return apiError('Select at least one valid package group', 400)

  const supabase = await getRouteSupabaseClient()
  try {
    const { data, error } = await supabase
      .from('travel_package_groups')
      .delete()
      .in('id', ids)
      .select('id')

    if (error) throw error
    return apiOk({
      deletedIds: (data || []).map((group) => group.id),
      deletedCount: data?.length || 0,
    })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          deletedIds: [],
          deletedCount: 0,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to delete package groups',
      500,
    )
  }
}

export async function POST(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const title = cleanPackageGroupText(body.title)
  const leadPackageId = cleanPackageGroupText(body.leadPackageId || body.lead_package_id)
  const leadQuoteId = cleanPackageGroupText(body.leadQuoteId || body.lead_quote_id)
  if (!title) return apiError('Package group title is required', 400)

  try {
    const { data: groupData, error: groupError } = await supabase
      .from('travel_package_groups')
      .insert({
        title,
        lead_package_id: leadPackageId || null,
        lead_quote_id: leadQuoteId || null,
        status: 'active',
        customer_visibility_mode: 'shared_group_view',
        internal_notes: cleanPackageGroupText(body.internalNotes || body.internal_notes) || null,
        metadata: cleanMetadata(body.groupMetadata || body.group_metadata),
        created_by: user.id,
        updated_by: user.id,
      })
      .select(selectTravelPackageGroupColumns())
      .single()

    if (groupError || !groupData) throw groupError || new Error('Failed to create package group')
    const group = groupData as unknown as TravelPackageGroup

    if (leadPackageId || leadQuoteId) {
      const { error: memberError } = await supabase.from('travel_package_group_members').insert({
        group_id: group.id,
        package_id: leadPackageId || null,
        quote_id: leadQuoteId || null,
        family_label: cleanPackageGroupText(body.familyLabel || body.family_label) || 'Family 1',
        customer_display_name:
          cleanPackageGroupText(body.customerDisplayName || body.customer_display_name) || null,
        is_lead_family: true,
        customer_visible: cleanBoolean(body.customerVisible ?? body.customer_visible),
        sort_order: 10,
        metadata: cleanMetadata(body.metadata),
      })

      if (memberError) throw memberError
    }

    return apiOk(
      {
        group,
        setupRequired: false,
      },
      { status: 201 },
    )
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          group: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to create package group',
      500,
    )
  }
}
