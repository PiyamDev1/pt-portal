import type { TravelPackageType } from '@/app/types/packages'

export const PACKAGE_TYPE_OPTIONS: ReadonlyArray<{
  value: TravelPackageType
  label: string
}> = [
  { value: 'umrah', label: 'Umrah' },
  { value: 'ziyarat', label: 'Ziyarat' },
  { value: 'holiday', label: 'Holiday' },
]

export function formatPackageTypeName(type: TravelPackageType) {
  return PACKAGE_TYPE_OPTIONS.find((candidate) => candidate.value === type)?.label || 'Package'
}
