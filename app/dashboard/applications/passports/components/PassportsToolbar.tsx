/**
 * Module: app/dashboard/applications/passports/components/PassportsToolbar.tsx
 * Dashboard module for applications/passports/components/PassportsToolbar.tsx.
 */

import type { Dispatch, SetStateAction } from 'react'

type PassportsToolbarProps = {
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  statusFilter: string
  setStatusFilter: Dispatch<SetStateAction<string>>
  speedFilter: string
  setSpeedFilter: Dispatch<SetStateAction<string>>
  speedOptions: string[]
  startDate: string
  setStartDate: Dispatch<SetStateAction<string>>
  endDate: string
  setEndDate: Dispatch<SetStateAction<string>>
  showForm: boolean
  setShowForm: Dispatch<SetStateAction<boolean>>
}

export default function PassportsToolbar({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  speedFilter,
  setSpeedFilter,
  speedOptions,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  showForm,
  setShowForm,
}: PassportsToolbarProps) {
  const trimmedSearch = searchQuery.trim()
  const hasActiveFilters = Boolean(trimmedSearch || statusFilter !== 'All' || speedFilter !== 'All' || startDate || endDate)

  return (
    <div className="space-y-3">
      <div className="flex flex-col xl:flex-row xl:items-start gap-4">
        <div className="flex-1 space-y-3 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_180px_180px] gap-3">
            <div className="relative min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, CNIC, passport #, tracking, phone, notes..."
                className="w-full min-w-0 pl-10 pr-12 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-green-500"
                aria-label="Search passport applications"
              />
              {trimmedSearch && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear passport search"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Filter passport applications by status"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Submission">Pending Submission</option>
              <option value="Biometrics Taken">Biometrics Taken</option>
              <option value="Processing">Processing</option>
              <option value="Approved">Approved</option>
              <option value="Passport Arrived">Passport Arrived</option>
              <option value="Collected">Collected</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={speedFilter}
              onChange={(e) => setSpeedFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Filter passport applications by speed"
            >
              <option value="All">All Speeds</option>
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                placeholder="From"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                placeholder="To"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('All')
                  setSpeedFilter('All')
                  setStartDate('')
                  setEndDate('')
                }}
                className="text-sm text-slate-500 hover:text-slate-700 underline md:ml-auto"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-md transition xl:self-start"
        >
          {showForm ? 'Close Form' : '+ New Application'}
        </button>
      </div>

      {!!trimmedSearch && (
        <div className="text-xs text-slate-500">
          Search checks applicant details, tracking, passport numbers, status, speed, requested-page text, and notes.
        </div>
      )}
    </div>
  )
}
