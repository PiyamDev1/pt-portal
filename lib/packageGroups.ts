import type {
  PackageLinkedPackageGroupSnapshot,
  TravelPackageGroup,
  TravelPackageGroupAllocationMode,
  TravelPackageGroupMember,
  TravelPackageGroupSharedService,
  TravelPackageGroupSharedServiceStatus,
  TravelPackageGroupSharedServiceType,
  TravelPackageGroupStatus,
  TravelPackageGroupVisibilityMode,
} from '@/app/types/packages'

export const TRAVEL_PACKAGE_GROUP_SCHEMA_HINT =
  'Linked travel package group schema is not installed yet. Run scripts/migrations/20260721_create_travel_package_groups.sql in Supabase SQL editor.'

export const TRAVEL_PACKAGE_GROUP_STATUSES = new Set<TravelPackageGroupStatus>([
  'draft',
  'active',
  'partially_finalised',
  'finalised',
  'cancelled',
  'completed',
  'archived',
])

export const TRAVEL_PACKAGE_GROUP_VISIBILITY_MODES = new Set<TravelPackageGroupVisibilityMode>([
  'private',
  'linked_notice_only',
  'shared_group_view',
])

export const TRAVEL_PACKAGE_GROUP_SERVICE_TYPES = new Set<TravelPackageGroupSharedServiceType>([
  'transport',
  'guide',
  'ziyarat',
  'other',
])

export const TRAVEL_PACKAGE_GROUP_SERVICE_STATUSES = new Set<TravelPackageGroupSharedServiceStatus>(
  ['draft', 'quoted', 'reserved', 'confirmed', 'changed', 'cancelled'],
)

export const TRAVEL_PACKAGE_GROUP_ALLOCATION_MODES = new Set<TravelPackageGroupAllocationMode>([
  'per_passenger',
  'equal_per_package',
  'manual',
  'one_package_pays',
  'no_split_note_only',
])

export type TravelPackageGroupDetail = TravelPackageGroup & {
  members: TravelPackageGroupMember[]
  sharedServices: Array<
    TravelPackageGroupSharedService & {
      allocations: Array<Record<string, unknown>>
    }
  >
}

export function isTravelPackageGroupSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export function cleanPackageGroupText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function cleanPackageGroupNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function selectTravelPackageGroupColumns() {
  return `
    id,
    group_reference,
    title,
    lead_package_id,
    lead_quote_id,
    status,
    customer_visibility_mode,
    internal_notes,
    metadata,
    created_by,
    updated_by,
    created_at,
    updated_at,
    archived_at
  `
}

export function selectTravelPackageGroupMemberColumns() {
  return `
    id,
    group_id,
    package_id,
    quote_id,
    family_label,
    customer_display_name,
    is_lead_family,
    customer_visible,
    sort_order,
    metadata,
    created_at,
    updated_at
  `
}

export function selectTravelPackageGroupSharedServiceColumns() {
  return `
    id,
    group_id,
    service_type,
    title,
    description,
    status,
    supplier_name,
    supplier_reference,
    currency,
    internal_total_cost,
    customer_note,
    allocation_mode,
    allocation_payload,
    customer_visible,
    metadata,
    created_by,
    updated_by,
    created_at,
    updated_at,
    archived_at
  `
}

export function selectTravelPackageGroupAllocationColumns() {
  return `
    id,
    shared_service_id,
    group_id,
    package_id,
    quote_id,
    allocation_mode,
    passenger_count,
    allocated_cost,
    allocated_sale_value,
    internal_notes,
    metadata,
    created_at,
    updated_at
  `
}

export function buildLinkedPackageGroupSnapshot(
  group: TravelPackageGroupDetail,
  current: { packageId?: string | null; quoteId?: string | null } = {},
): PackageLinkedPackageGroupSnapshot {
  const currentMember =
    group.members.find(
      (member) =>
        (current.packageId && member.package_id === current.packageId) ||
        (current.quoteId && member.quote_id === current.quoteId),
    ) || group.members.find((member) => member.is_lead_family)

  return {
    groupId: group.id,
    groupReference: group.group_reference,
    title: group.title,
    visibilityMode: group.customer_visibility_mode,
    currentFamilyLabel: currentMember?.family_label || 'This family',
    linkedFamilies: group.members
      .filter((member) => member.id !== currentMember?.id)
      .map((member) => ({
        packageId: member.package_id,
        quoteId: member.quote_id,
        familyLabel: member.family_label,
        packageReference:
          typeof member.metadata?.packageReference === 'string'
            ? member.metadata.packageReference
            : null,
        quoteTitle:
          typeof member.metadata?.quoteTitle === 'string' ? member.metadata.quoteTitle : null,
        customerVisible: member.customer_visible,
      })),
    sharedServices: group.sharedServices.map((service) => ({
      serviceType: service.service_type,
      title: service.title,
      customerNote: service.customer_note,
      customerVisible: service.customer_visible,
    })),
  }
}
