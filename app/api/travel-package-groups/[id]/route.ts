import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageGroup,
  TravelPackageGroupMember,
  TravelPackageGroupServiceAllocation,
  TravelPackageGroupStatus,
  TravelPackageGroupSharedService,
  TravelPackageGroupVisibilityMode,
} from '@/app/types/packages'
import {
  cleanPackageGroupText,
  isTravelPackageGroupSchemaError,
  selectTravelPackageGroupAllocationColumns,
  selectTravelPackageGroupColumns,
  selectTravelPackageGroupMemberColumns,
  selectTravelPackageGroupSharedServiceColumns,
  TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
  TRAVEL_PACKAGE_GROUP_STATUSES,
  TRAVEL_PACKAGE_GROUP_VISIBILITY_MODES,
  type TravelPackageGroupDetail,
} from '@/lib/packageGroups'

async function loadGroupDetail(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  id: string,
) {
  const { data: group, error: groupError } = await supabase
    .from('travel_package_groups')
    .select(selectTravelPackageGroupColumns())
    .eq('id', id)
    .single()

  if (groupError || !group) throw groupError || new Error('Package group not found')

  const [members, services] = await Promise.all([
    supabase
      .from('travel_package_group_members')
      .select(selectTravelPackageGroupMemberColumns())
      .eq('group_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('travel_package_group_shared_services')
      .select(selectTravelPackageGroupSharedServiceColumns())
      .eq('group_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (members.error) throw members.error
  if (services.error) throw services.error

  const groupMembers = (members.data || []) as unknown as TravelPackageGroupMember[]
  const groupServices = (services.data || []) as unknown as TravelPackageGroupSharedService[]
  const serviceIds = groupServices.map((service) => service.id)
  const allocations =
    serviceIds.length > 0
      ? await supabase
          .from('travel_package_group_service_allocations')
          .select(selectTravelPackageGroupAllocationColumns())
          .in('shared_service_id', serviceIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null }

  if (allocations.error) throw allocations.error
  const serviceAllocations = (allocations.data ||
    []) as unknown as TravelPackageGroupServiceAllocation[]

  return {
    ...(group as unknown as TravelPackageGroup),
    members: groupMembers,
    sharedServices: groupServices.map((service) => ({
      ...service,
      allocations: serviceAllocations.filter(
        (allocation) => allocation.shared_service_id === service.id,
      ),
    })),
  } as unknown as TravelPackageGroupDetail
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  try {
    const group = await loadGroupDetail(supabase, id)
    return apiOk({ group, setupRequired: false })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk({
        group: null,
        setupRequired: true,
        message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
      })
    }
    return apiError((error as { message?: string })?.message || 'Package group not found', 404)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const update: Record<string, unknown> = { updated_by: user.id }

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = cleanPackageGroupText(body.title)
    if (!title) return apiError('Package group title is required', 400)
    update.title = title
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanPackageGroupText(body.status) as TravelPackageGroupStatus
    if (!TRAVEL_PACKAGE_GROUP_STATUSES.has(status)) {
      return apiError('Invalid package group status', 400)
    }
    update.status = status
    update.archived_at = status === 'archived' ? new Date().toISOString() : null
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'customerVisibilityMode') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_visibility_mode')
  ) {
    const visibility = cleanPackageGroupText(
      body.customerVisibilityMode || body.customer_visibility_mode,
    ) as TravelPackageGroupVisibilityMode
    if (!TRAVEL_PACKAGE_GROUP_VISIBILITY_MODES.has(visibility)) {
      return apiError('Invalid customer visibility mode', 400)
    }
    update.customer_visibility_mode = visibility
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'leadPackageId') ||
    Object.prototype.hasOwnProperty.call(body, 'lead_package_id')
  ) {
    update.lead_package_id =
      cleanPackageGroupText(body.leadPackageId || body.lead_package_id) || null
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'leadQuoteId') ||
    Object.prototype.hasOwnProperty.call(body, 'lead_quote_id')
  ) {
    update.lead_quote_id = cleanPackageGroupText(body.leadQuoteId || body.lead_quote_id) || null
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'internalNotes') ||
    Object.prototype.hasOwnProperty.call(body, 'internal_notes')
  ) {
    update.internal_notes = cleanPackageGroupText(body.internalNotes || body.internal_notes) || null
  }

  if (Object.keys(update).length === 1) return apiError('No package group changes supplied', 400)

  try {
    const { data, error } = await supabase
      .from('travel_package_groups')
      .update(update)
      .eq('id', id)
      .select(selectTravelPackageGroupColumns())
      .single()

    if (error || !data) throw error || new Error('Package group not found')

    return apiOk({
      group: data as unknown as TravelPackageGroup,
      setupRequired: false,
    })
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
      (error as { message?: string })?.message || 'Failed to update package group',
      500,
    )
  }
}
