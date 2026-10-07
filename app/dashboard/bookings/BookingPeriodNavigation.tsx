import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from './BookingIcons'

export type BookingView = 'today' | 'week' | 'list' | 'multi'

type BookingPeriodNavigationProps = {
  view: BookingView
  isCurrentPeriod: boolean
  variant: 'mobile' | 'desktop'
  onPrevious: () => void
  onToday: () => void
  onNext: () => void
}

export default function BookingPeriodNavigation({
  view,
  isCurrentPeriod,
  variant,
  onPrevious,
  onToday,
  onNext,
}: BookingPeriodNavigationProps) {
  const previousLabel =
    view === 'multi' ? 'Previous month' : view === 'today' ? 'Previous day' : 'Previous week'
  const nextLabel = view === 'multi' ? 'Next month' : view === 'today' ? 'Next day' : 'Next week'
  const compact = variant === 'mobile'

  const controls = (
    <>
      <button
        onClick={onPrevious}
        aria-label={previousLabel}
        title={previousLabel}
        className={
          compact
            ? 'ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600'
            : 'ui-tap ui-focus inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50'
        }
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      <button
        onClick={onToday}
        className={
          compact
            ? `ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
                isCurrentPeriod
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`
            : `ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:-translate-y-0.5 sm:text-sm ${
                isCurrentPeriod
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`
        }
      >
        <ClockIcon className="h-4 w-4" />
        Today
      </button>

      <button
        onClick={onNext}
        aria-label={nextLabel}
        title={nextLabel}
        className={
          compact
            ? 'ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600'
            : 'ui-tap ui-focus inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50'
        }
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </>
  )

  return compact ? <div className="grid grid-cols-[auto_1fr_auto] gap-2">{controls}</div> : controls
}
