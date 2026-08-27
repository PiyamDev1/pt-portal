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
  resolvePackageGroupCustomerShare,
  selectTravelPackageGroupAllocationColumns,
  selectTravelPackageGroupColumns,
  selectTravelPackageGroupMemberColumns,
  selectTravelPackageGroupSharedServiceColumns,
  TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
  TRAVEL_PACKAGE_GROUP_STATUSES,
  TRAVEL_PACKAGE_GROUP_VISIBILITY_MODES,
  type TravelPackageGroupDetail,
} from '@/lib/packageGroups'

function cleanMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

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
  const quoteIds = groupMembers
    .map((member) => member.quote_id)
    .filter((quoteId): quoteId is string => Boolean(quoteId))
  const [allocations, shareQuotes] = await Promise.all([
    serviceIds.length > 0
      ? supabase
          .from('travel_package_group_service_allocations')
          .select(selectTravelPackageGroupAllocationColumns())
          .in('shared_service_id', serviceIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? supabase
          .from('travel_package_quotes')
          .select(
            'id, share_token, share_enabled, expires_at, status, selected_option, selected_at, finalised_at, converted_package_id',
          )
          .in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (allocations.error) throw allocations.error
  if (shareQuotes.error) throw shareQuotes.error
  const serviceAllocations = (allocations.data ||
    []) as unknown as TravelPackageGroupServiceAllocation[]
  const packageGroup = group as unknown as TravelPackageGroup
  const customerShare = resolvePackageGroupCustomerShare(
    packageGroup,
    groupMembers,
    (shareQuotes.data || []) as unknown as Parameters<typeof resolvePackageGroupCustomerShare>[2],
  )
  const groupQuoteRows = (shareQuotes.data || []) as unknown as Array<
    Parameters<typeof resolvePackageGroupCustomerShare>[2][number] & {
      selected_option?: { selection?: { paymentScope?: string } } | null
      selected_at?: string | null
      finalised_at?: string | null
      converted_package_id?: string | null
    }
  >
  const quoteRowMap = new Map(groupQuoteRows.map((quote) => [quote.id, quote]))
  const allFamilySelectionsReady =
    quoteIds.length > 0 &&
    quoteIds.every((quoteId) => {
      const memberQuote = quoteRowMap.get(quoteId)
      return Boolean(
        memberQuote?.selected_option &&
        memberQuote.selected_at &&
        (memberQuote.finalised_at ||
          ['customer_selected', 'agent_selected', 'finalised', 'converted'].includes(
            memberQuote.status,
          )),
      )
    })
  const groupConversionQuoteId =
    groupQuoteRows.find(
      (memberQuote) => memberQuote.selected_option?.selection?.paymentScope === 'group',
    )?.id ||
    packageGroup.lead_quote_id ||
    groupMembers.find((member) => member.is_lead_family)?.quote_id ||
    quoteIds[0] ||
    null

  return {
    ...packageGroup,
    members: groupMembers,
    sharedServices: groupServices.map((service) => ({
      ...service,
      allocations: serviceAllocations.filter(
        (allocation) => allocation.shared_service_id === service.id,
      ),
    })),
    customerSharePath: customerShare?.sharePath || null,
    customerShareQuoteId: customerShare?.quoteId || null,
    customerShareExpiresAt: customerShare?.expiresAt || null,
    allFamilySelectionsReady,
    groupConversionQuoteId,
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
    Object.prototype.hasOwnProperty.call(body, 'customerFileMode') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_file_mode')
  ) {
    const customerFileMode = cleanPackageGroupText(body.customerFileMode || body.customer_file_mode)
    if (!['separate', 'combined'].includes(customerFileMode)) {
      return apiError('Invalid customer file mode', 400)
    }
    update.customer_file_mode = customerFileMode
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

  if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
    update.metadata = cleanMetadata(body.metadata)
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
