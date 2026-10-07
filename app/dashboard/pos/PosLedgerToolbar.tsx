import type { RefObject } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react'
import type { PosLedgerPeriod } from '@/lib/pos/contracts'

export const POS_LEDGER_SORT_OPTIONS = ['Supplier', 'Newest'] as const
export type PosLedgerSort = (typeof POS_LEDGER_SORT_OPTIONS)[number]

type Props = {
  period: PosLedgerPeriod
  date: string
  todayDate: string
  search: string
  sortBy: PosLedgerSort
  filtersOpen: boolean
  searchInputRef: RefObject<HTMLInputElement>
  onPeriodChange: (period: PosLedgerPeriod) => void
  onPrevious: () => void
  onDateChange: (date: string) => void
  onNext: () => void
  onToday: () => void
  onSearchChange: (search: string) => void
  onSortChange: (sort: PosLedgerSort) => void
  onToggleFilters: () => void
}

export default function PosLedgerToolbar({
  period,
  date,
  todayDate,
  search,
  sortBy,
  filtersOpen,
  searchInputRef,
  onPeriodChange,
  onPrevious,
  onDateChange,
  onNext,
  onToday,
  onSearchChange,
  onSortChange,
  onToggleFilters,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <div
        data-pos-tour="ledger-period"
        className="flex h-9 rounded-xl border border-slate-200 bg-white p-1"
      >
        {(['day', 'month'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPeriodChange(option)}
            aria-pressed={period === option}
            className={`rounded-lg px-2 text-[10px] font-black capitalize transition ${
              period === option ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={onPrevious}
          aria-label={period === 'month' ? 'Previous month' : 'Previous day'}
          className="flex h-full w-8 items-center justify-center rounded-l-xl text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <label className="relative h-full">
          <span className="sr-only">{period === 'month' ? 'Ledger month' : 'Ledger date'}</span>
          <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type={period === 'month' ? 'month' : 'date'}
            value={period === 'month' ? date.slice(0, 7) : date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-full w-[8.5rem] border-x border-slate-200 bg-white pl-7 pr-1 text-[10px] font-bold text-slate-700 outline-none focus:bg-red-50/40"
          />
        </label>
        <button
          type="button"
          onClick={onNext}
          aria-label={period === 'month' ? 'Next month' : 'Next day'}
          className="flex h-full w-8 items-center justify-center rounded-r-xl text-slate-500 hover:bg-slate-100"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        className={`h-9 rounded-xl border px-3 text-[10px] font-black transition ${
          period === 'day' && date === todayDate
            ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        Today
      </button>
      <label data-pos-tour="ledger-search" className="relative min-w-0 flex-1 lg:w-56">
        <span className="sr-only">Search transactions</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          aria-label="Search transactions"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search reference or name"
          className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-xs font-semibold text-slate-900 outline-none transition placeholder:font-normal focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
          /
        </kbd>
      </label>
      <label className="sr-only" htmlFor="ledger-sort">
        Sort ledger
      </label>
      <select
        id="ledger-sort"
        value={sortBy}
        onChange={(event) => onSortChange(event.target.value as PosLedgerSort)}
        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 outline-none focus:border-[#8b1e2d]"
      >
        {POS_LEDGER_SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'Supplier' ? 'Supplier sort' : 'Newest first'}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-pos-tour="ledger-filters"
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
        className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
          filtersOpen
            ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Filter className="h-4 w-4" />
        <span className="hidden sm:inline">Filters</span>
      </button>
    </div>
  )
}
