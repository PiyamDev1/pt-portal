/**
 * Team Filters Bar
 * Filter toolbar for team timeclock history queries and exports.
 *
 * @module app/dashboard/timeclock/team/components/TeamFiltersBar
 */

import { CalendarDays, Download, RefreshCw, Users } from 'lucide-react'

type EmployeeOption = {
  id: string
  name: string
}

type TeamFiltersBarProps = {
  dateFrom: string
  dateTo: string
  selectedEmployee: string
  employees: EmployeeOption[]
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
  setSelectedEmployee: (value: string) => void
  setPage: (value: number) => void
  applyPreset: (preset: 'today' | 'last7' | 'last30' | 'clear') => void
  onApply: () => void
  onExport: () => void
}

export function TeamFiltersBar({
  dateFrom,
  dateTo,
  selectedEmployee,
  employees,
  setDateFrom,
  setDateTo,
  setSelectedEmployee,
  setPage,
  applyPreset,
  onApply,
  onExport,
}: TeamFiltersBarProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[#8b1e2d]">
          <Users className="h-4 w-4" />
          <p className="text-xs font-black uppercase tracking-[0.16em]">Team evidence</p>
        </div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Team punches</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Filter by employee and date to review recorded attendance.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="flex flex-wrap gap-2 xl:flex-1">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="ui-tap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
            >
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Today
              </span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last7')}
              className="ui-tap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
            >
              Last 7
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last30')}
              className="ui-tap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
            >
              Last 30
            </button>
            <button
              type="button"
              onClick={() => applyPreset('clear')}
              className="ui-tap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
            >
              Clear
            </button>
          </div>
          <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setPage(1)
                setDateFrom(event.target.value)
              }}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setPage(1)
                setDateTo(event.target.value)
              }}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            Employee
            <select
              value={selectedEmployee}
              onChange={(event) => {
                setPage(1)
                setSelectedEmployee(event.target.value)
              }}
              className="mt-1 block w-full min-w-44 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onApply}
            className="ui-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-4 text-xs font-black text-white hover:bg-[#6f1422]"
          >
            <RefreshCw className="h-4 w-4" /> Apply
          </button>
          <button
            type="button"
            onClick={onExport}
            className="ui-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:border-slate-300 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
