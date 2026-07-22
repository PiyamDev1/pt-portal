import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  cleanPackageGroupText,
  isTravelPackageGroupSchemaError,
  selectTravelPackageGroupMemberColumns,
  TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
} from '@/lib/packageGroups'

function cleanSortOrder(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

function cleanBoolean(value: unknown) {
  return value === true || value === 'true'
}

function cleanMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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

  const packageId = cleanPackageGroupText(body.packageId || body.package_id)
  const quoteId = cleanPackageGroupText(body.quoteId || body.quote_id)
  if (!packageId && !quoteId) return apiError('Package ID or quote ID is required', 400)

  try {
    const memberLookup = packageId
      ? await supabase
          .from('travel_package_group_members')
          .select(selectTravelPackageGroupMemberColumns())
          .eq('group_id', id)
          .eq('package_id', packageId)
          .maybeSingle()
      : await supabase
          .from('travel_package_group_members')
          .select(selectTravelPackageGroupMemberColumns())
          .eq('group_id', id)
          .eq('quote_id', quoteId)
          .maybeSingle()

    if (memberLookup.error) throw memberLookup.error

    const memberValues = {
      family_label: cleanPackageGroupText(body.familyLabel || body.family_label) || 'Family',
      customer_display_name:
        cleanPackageGroupText(body.customerDisplayName || body.customer_display_name) || null,
      is_lead_family: cleanBoolean(body.isLeadFamily ?? body.is_lead_family),
      customer_visible: cleanBoolean(body.customerVisible ?? body.customer_visible),
      sort_order: cleanSortOrder(body.sortOrder ?? body.sort_order),
      metadata: cleanMetadata(body.metadata),
    }

    const existingMember = memberLookup.data as { id: string } | null

    if (existingMember) {
      const { data, error } = await supabase
        .from('travel_package_group_members')
        .update(memberValues)
        .eq('id', existingMember.id)
        .eq('group_id', id)
        .select(selectTravelPackageGroupMemberColumns())
        .single()

      if (error || !data) throw error || new Error('Failed to update package group member')

      return apiOk({ member: data, setupRequired: false, linkedExisting: true })
    }

    const { data, error } = await supabase
      .from('travel_package_group_members')
      .insert({
        group_id: id,
        package_id: packageId || null,
        quote_id: quoteId || null,
        ...memberValues,
      })
      .select(selectTravelPackageGroupMemberColumns())
      .single()

    if (error || !data) throw error || new Error('Failed to add package group member')

    return apiOk({ member: data, setupRequired: false }, { status: 201 })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          member: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to add package group member',
      500,
    )
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

  const memberId = cleanPackageGroupText(body.memberId || body.member_id)
  if (!memberId) return apiError('Member ID is required', 400)

  const update: Record<string, unknown> = {}

  if (
    Object.prototype.hasOwnProperty.call(body, 'familyLabel') ||
    Object.prototype.hasOwnProperty.call(body, 'family_label')
  ) {
    const familyLabel = cleanPackageGroupText(body.familyLabel || body.family_label)
    if (!familyLabel) return apiError('Family label is required', 400)
    update.family_label = familyLabel
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'customerDisplayName') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_display_name')
  ) {
    update.customer_display_name =
      cleanPackageGroupText(body.customerDisplayName || body.customer_display_name) || null
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'isLeadFamily') ||
    Object.prototype.hasOwnProperty.call(body, 'is_lead_family')
  ) {
    update.is_lead_family = Boolean(body.isLeadFamily || body.is_lead_family)
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'customerVisible') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_visible')
  ) {
    update.customer_visible = Boolean(body.customerVisible || body.customer_visible)
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'sortOrder') ||
    Object.prototype.hasOwnProperty.call(body, 'sort_order')
  ) {
    update.sort_order = cleanSortOrder(body.sortOrder || body.sort_order)
  }

  if (Object.keys(update).length === 0) return apiError('No member changes supplied', 400)

  try {
    const { data, error } = await supabase
      .from('travel_package_group_members')
      .update(update)
      .eq('id', memberId)
      .eq('group_id', id)
      .select(selectTravelPackageGroupMemberColumns())
      .single()

    if (error || !data) throw error || new Error('Package group member not found')

    return apiOk({ member: data, setupRequired: false })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          member: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to update package group member',
      500,
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const memberId = cleanPackageGroupText(request.nextUrl.searchParams.get('memberId'))
  if (!memberId) return apiError('Member ID is required', 400)

  const { error } = await supabase
    .from('travel_package_group_members')
    .delete()
    .eq('id', memberId)
    .eq('group_id', id)

  if (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          deleted: false,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(error.message || 'Failed to remove package group member', 500)
  }

  return apiOk({ deleted: true, setupRequired: false })
}
