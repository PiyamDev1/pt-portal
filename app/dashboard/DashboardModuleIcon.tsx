import type { ComponentType } from 'react'
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Clock3,
  FileText,
  FingerprintPattern,
  GraduationCap,
  HeartPulse,
  Plane,
  Settings,
  Ticket,
} from 'lucide-react'
import { PackageTravelIcon } from '@/app/components/icons/PackageTravelIcon'
import type { DashboardModule } from '@/lib/dashboardModules'

type IconProps = { className?: string }

const ICONS: Record<DashboardModule['iconKey'], ComponentType<IconProps>> = {
  'badge-pound': BadgePoundSterling,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  'chart-column': ChartNoAxesColumnIncreasing,
  clock: Clock3,
  'file-text': FileText,
  fingerprint: FingerprintPattern,
  graduation: GraduationCap,
  heart: HeartPulse,
  'package-travel': PackageTravelIcon,
  plane: Plane,
  settings: Settings,
  ticket: Ticket,
}

export function DashboardModuleIcon({
  moduleItem,
  className = 'h-5 w-5',
}: {
  moduleItem: DashboardModule
  className?: string
}) {
  const Icon = ICONS[moduleItem.iconKey]
  return <Icon className={className} />
}
