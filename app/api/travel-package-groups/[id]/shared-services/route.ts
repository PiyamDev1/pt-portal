import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type {
  TravelPackageGroupAllocationMode,
  TravelPackageGroupSharedServiceStatus,
  TravelPackageGroupSharedServiceType,
} from '@/app/types/packages'
import {
  cleanPackageGroupNumber,
  cleanPackageGroupText,
  isTravelPackageGroupSchemaError,
  selectTravelPackageGroupAllocationColumns,
  selectTravelPackageGroupSharedServiceColumns,
  TRAVEL_PACKAGE_GROUP_ALLOCATION_MODES,
  TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
  TRAVEL_PACKAGE_GROUP_SERVICE_STATUSES,
  TRAVEL_PACKAGE_GROUP_SERVICE_TYPES,
} from '@/lib/packageGroups'

function getAllocationMode(value: unknown) {
  const mode = cleanPackageGroupText(value) as TravelPackageGroupAllocationMode
  return TRAVEL_PACKAGE_GROUP_ALLOCATION_MODES.has(mode) ? mode : 'no_split_note_only'
}

function cleanPassengerCount(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function cleanMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

  const title = cleanPackageGroupText(body.title)
  if (!title) return apiError('Shared service title is required', 400)

  const serviceType = cleanPackageGroupText(
    body.serviceType || body.service_type || 'transport',
  ) as TravelPackageGroupSharedServiceType
  if (!TRAVEL_PACKAGE_GROUP_SERVICE_TYPES.has(serviceType)) {
    return apiError('Invalid shared service type', 400)
  }

  const allocationMode = getAllocationMode(body.allocationMode || body.allocation_mode)

  try {
    const { data, error } = await supabase
      .from('travel_package_group_shared_services')
      .insert({
        group_id: id,
        service_type: serviceType,
        title,
        description: cleanPackageGroupText(body.description) || null,
        status: 'draft',
        supplier_name: cleanPackageGroupText(body.supplierName || body.supplier_name) || null,
        supplier_reference:
          cleanPackageGroupText(body.supplierReference || body.supplier_reference) || null,
        currency: cleanPackageGroupText(body.currency) || 'GBP',
        internal_total_cost: cleanPackageGroupNumber(
          body.internalTotalCost || body.internal_total_cost,
        ),
        customer_note: cleanPackageGroupText(body.customerNote || body.customer_note),
        allocation_mode: allocationMode,
        allocation_payload: cleanMetadata(body.allocationPayload || body.allocation_payload),
        customer_visible:
          Object.prototype.hasOwnProperty.call(body, 'customerVisible') ||
          Object.prototype.hasOwnProperty.call(body, 'customer_visible')
            ? Boolean(body.customerVisible || body.customer_visible)
            : true,
        metadata: cleanMetadata(body.metadata),
        created_by: user.id,
        updated_by: user.id,
      })
      .select(selectTravelPackageGroupSharedServiceColumns())
      .single()

    if (error || !data) throw error || new Error('Failed to create shared service')

    return apiOk({ sharedService: data, setupRequired: false }, { status: 201 })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          sharedService: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to create shared service',
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

  const allocationId = cleanPackageGroupText(body.allocationId || body.allocation_id)
  if (allocationId) {
    const allocationUpdate: Record<string, unknown> = {}

    if (
      Object.prototype.hasOwnProperty.call(body, 'allocationMode') ||
      Object.prototype.hasOwnProperty.call(body, 'allocation_mode')
    ) {
      allocationUpdate.allocation_mode = getAllocationMode(
        body.allocationMode || body.allocation_mode,
      )
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'passengerCount') ||
      Object.prototype.hasOwnProperty.call(body, 'passenger_count')
    ) {
      allocationUpdate.passenger_count = cleanPassengerCount(
        body.passengerCount || body.passenger_count,
      )
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'allocatedCost') ||
      Object.prototype.hasOwnProperty.call(body, 'allocated_cost')
    ) {
      allocationUpdate.allocated_cost = cleanPackageGroupNumber(
        body.allocatedCost || body.allocated_cost,
      )
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'allocatedSaleValue') ||
      Object.prototype.hasOwnProperty.call(body, 'allocated_sale_value')
    ) {
      allocationUpdate.allocated_sale_value = cleanPackageGroupNumber(
        body.allocatedSaleValue || body.allocated_sale_value,
      )
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'internalNotes') ||
      Object.prototype.hasOwnProperty.call(body, 'internal_notes')
    ) {
      allocationUpdate.internal_notes =
        cleanPackageGroupText(body.internalNotes || body.internal_notes) || null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
      allocationUpdate.metadata = cleanMetadata(body.metadata)
    }

    if (Object.keys(allocationUpdate).length === 0) {
      return apiError('No allocation changes supplied', 400)
    }

    try {
      const { data, error } = await supabase
        .from('travel_package_group_service_allocations')
        .update(allocationUpdate)
        .eq('id', allocationId)
        .eq('group_id', id)
        .select(selectTravelPackageGroupAllocationColumns())
        .single()

      if (error || !data) throw error || new Error('Service allocation not found')

      return apiOk({ allocation: data, setupRequired: false })
    } catch (error) {
      if (isTravelPackageGroupSchemaError(error)) {
        return apiOk(
          {
            allocation: null,
            setupRequired: true,
            message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
          },
          { status: 503 },
        )
      }
      return apiError(
        (error as { message?: string })?.message || 'Failed to update service allocation',
        500,
      )
    }
  }

  const sharedServiceId = cleanPackageGroupText(
    body.sharedServiceId || body.shared_service_id || body.serviceId || body.service_id,
  )
  if (!sharedServiceId) return apiError('Shared service ID is required', 400)

  const update: Record<string, unknown> = { updated_by: user.id }

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = cleanPackageGroupText(body.title)
    if (!title) return apiError('Shared service title is required', 400)
    update.title = title
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    update.description = cleanPackageGroupText(body.description) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanPackageGroupText(body.status) as TravelPackageGroupSharedServiceStatus
    if (!TRAVEL_PACKAGE_GROUP_SERVICE_STATUSES.has(status)) {
      return apiError('Invalid shared service status', 400)
    }
    update.status = status
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'supplierName') ||
    Object.prototype.hasOwnProperty.call(body, 'supplier_name')
  ) {
    update.supplier_name = cleanPackageGroupText(body.supplierName || body.supplier_name) || null
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'supplierReference') ||
    Object.prototype.hasOwnProperty.call(body, 'supplier_reference')
  ) {
    update.supplier_reference =
      cleanPackageGroupText(body.supplierReference || body.supplier_reference) || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
    update.currency = cleanPackageGroupText(body.currency) || 'GBP'
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'internalTotalCost') ||
    Object.prototype.hasOwnProperty.call(body, 'internal_total_cost')
  ) {
    update.internal_total_cost = cleanPackageGroupNumber(
      body.internalTotalCost || body.internal_total_cost,
    )
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'customerNote') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_note')
  ) {
    update.customer_note = cleanPackageGroupText(body.customerNote || body.customer_note)
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'allocationMode') ||
    Object.prototype.hasOwnProperty.call(body, 'allocation_mode')
  ) {
    update.allocation_mode = getAllocationMode(body.allocationMode || body.allocation_mode)
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'allocationPayload') ||
    Object.prototype.hasOwnProperty.call(body, 'allocation_payload')
  ) {
    update.allocation_payload = cleanMetadata(body.allocationPayload || body.allocation_payload)
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'customerVisible') ||
    Object.prototype.hasOwnProperty.call(body, 'customer_visible')
  ) {
    update.customer_visible = Boolean(body.customerVisible || body.customer_visible)
  }

  if (Object.keys(update).length === 1) return apiError('No shared service changes supplied', 400)

  try {
    const { data, error } = await supabase
      .from('travel_package_group_shared_services')
      .update(update)
      .eq('id', sharedServiceId)
      .eq('group_id', id)
      .select(selectTravelPackageGroupSharedServiceColumns())
      .single()

    if (error || !data) throw error || new Error('Shared service not found')

    return apiOk({ sharedService: data, setupRequired: false })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          sharedService: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to update shared service',
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

  const allocationId = cleanPackageGroupText(request.nextUrl.searchParams.get('allocationId'))
  const sharedServiceId = cleanPackageGroupText(
    request.nextUrl.searchParams.get('sharedServiceId') ||
      request.nextUrl.searchParams.get('serviceId'),
  )

  if (!allocationId && !sharedServiceId) {
    return apiError('Shared service ID or allocation ID is required', 400)
  }

  const table = allocationId
    ? 'travel_package_group_service_allocations'
    : 'travel_package_group_shared_services'
  const targetId = allocationId || sharedServiceId

  const { error } = await supabase.from(table).delete().eq('id', targetId).eq('group_id', id)

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
    return apiError(error.message || 'Failed to remove shared service item', 500)
  }

  return apiOk({ deleted: true, setupRequired: false })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const sharedServiceId = cleanPackageGroupText(
    body.sharedServiceId || body.shared_service_id || body.serviceId || body.service_id,
  )
  if (!sharedServiceId) return apiError('Shared service ID is required', 400)

  const packageId = cleanPackageGroupText(body.packageId || body.package_id)
  const quoteId = cleanPackageGroupText(body.quoteId || body.quote_id)
  if (!packageId && !quoteId) return apiError('Package ID or quote ID is required', 400)

  const allocationMode = getAllocationMode(body.allocationMode || body.allocation_mode)

  try {
    const { data, error } = await supabase
      .from('travel_package_group_service_allocations')
      .insert({
        shared_service_id: sharedServiceId,
        group_id: id,
        package_id: packageId || null,
        quote_id: quoteId || null,
        allocation_mode: allocationMode,
        passenger_count: cleanPassengerCount(body.passengerCount || body.passenger_count),
        allocated_cost: cleanPackageGroupNumber(body.allocatedCost || body.allocated_cost),
        allocated_sale_value: cleanPackageGroupNumber(
          body.allocatedSaleValue || body.allocated_sale_value,
        ),
        internal_notes: cleanPackageGroupText(body.internalNotes || body.internal_notes) || null,
        metadata: cleanMetadata(body.metadata),
      })
      .select(selectTravelPackageGroupAllocationColumns())
      .single()

    if (error || !data) throw error || new Error('Failed to create service allocation')

    return apiOk({ allocation: data, setupRequired: false }, { status: 201 })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiOk(
        {
          allocation: null,
          setupRequired: true,
          message: TRAVEL_PACKAGE_GROUP_SCHEMA_HINT,
        },
        { status: 503 },
      )
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to create service allocation',
      500,
    )
  }
}
