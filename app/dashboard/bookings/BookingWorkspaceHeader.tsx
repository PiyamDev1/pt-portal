import {
  CalendarIcon,
  ClockIcon,
  FilterIcon,
  ListIcon,
  PinIcon,
  SparkIcon,
  WeekIcon,
} from './BookingIcons'
import type { BookingView } from './BookingPeriodNavigation'

export type BookingWorkspaceFilterBadge = {
  key: string
  label: string
  icon: 'filter' | 'location'
}

type BookingWorkspaceHeaderProps = {
  view: BookingView
  periodLabel: string
  filterBadges: BookingWorkspaceFilterBadge[]
  onViewChange: (view: BookingView) => void
}

const VIEW_OPTIONS: Array<{
  id: BookingView
  label: string
  description: string
  icon: typeof ClockIcon
  selectedClassName: string
  inactiveClassName: string
}> = [
  {
    id: 'today',
    label: 'Day',
    description: 'Daily agenda',
    icon: ClockIcon,
    selectedClassName: 'bg-indigo-600 text-white shadow-sm',
    inactiveClassName: 'text-slate-600 hover:bg-slate-50',
  },
  {
    id: 'multi',
    label: 'Calendar',
    description: 'Calendar overview',
    icon: CalendarIcon,
    selectedClassName: 'bg-indigo-600 text-white shadow-sm',
    inactiveClassName: 'border-l border-slate-200 text-slate-600 hover:bg-slate-50',
  },
  {
    id: 'week',
    label: 'Week',
    description: 'Week timeline',
    icon: WeekIcon,
    selectedClassName: 'border-l border-slate-200 bg-indigo-600 text-white shadow-sm',
    inactiveClassName: 'border-l border-slate-200 text-slate-600 hover:bg-slate-50',
  },
  {
    id: 'list',
    label: 'List',
    description: 'Appointment list',
    icon: ListIcon,
    selectedClassName: 'border-l border-slate-200 bg-indigo-600 text-white shadow-sm',
    inactiveClassName: 'border-l border-slate-200 text-slate-600 hover:bg-slate-50',
  },
]

export default function BookingWorkspaceHeader({
  view,
  periodLabel,
  filterBadges,
  onViewChange,
}: BookingWorkspaceHeaderProps) {
  const currentView = VIEW_OPTIONS.find((option) => option.id === view) || VIEW_OPTIONS[0]
  const CurrentViewIcon = currentView.icon

  return (
    <div className="space-y-3">
      <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
        <SparkIcon className="h-3.5 w-3.5" />
        Booking desk
      </span>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Appointments</h1>
          <p className="mt-1 text-sm text-slate-600">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-sm">
          <div
            role="group"
            aria-label="Appointment view"
            className="flex overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = view === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onViewChange(option.id)}
                  aria-pressed={selected}
                  className={`ui-tap ui-focus inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-all sm:px-3 sm:text-sm ${
                    selected ? option.selectedClassName : option.inactiveClassName
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
          <CurrentViewIcon className="h-3.5 w-3.5" />
          {currentView.description}
        </span>
        {filterBadges.map((badge) => {
          const Icon = badge.icon === 'location' ? PinIcon : FilterIcon

          return (
            <span
              key={badge.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600"
            >
              <Icon className="h-3.5 w-3.5" />
              {badge.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
