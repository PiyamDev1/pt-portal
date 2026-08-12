import type { LucideIcon } from 'lucide-react'
import { Building2, Car, PackageCheck, Plane, Stamp } from 'lucide-react'
import type { TravelPackageReservationType } from '@/app/types/packages'

export function getReservationIcon(type: TravelPackageReservationType): LucideIcon {
  if (type === 'flight') return Plane
  if (type === 'hotel') return Building2
  if (type === 'visa') return Stamp
  if (type === 'transport') return Car
  return PackageCheck
}

export function PackageStatusCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 text-sm font-black capitalize text-slate-950">
        {value.replace(/_/g, ' ')}
      </p>
    </div>
  )
}
