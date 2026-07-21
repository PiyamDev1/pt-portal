import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
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
    } else {
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
        customer_visibility_mode: 'linked_notice_only',
        internal_notes: cleanPackageGroupText(body.internalNotes || body.internal_notes) || null,
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
        customer_visible: Boolean(body.customerVisible || body.customer_visible),
        sort_order: 10,
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
