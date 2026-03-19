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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Team punches</h2>
        <p className="text-sm text-slate-500">Filter by employee to review punches.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset('today')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyPreset('last7')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Last 7
          </button>
          <button
            type="button"
            onClick={() => applyPreset('last30')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Last 30
          </button>
          <button
            type="button"
            onClick={() => applyPreset('clear')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Clear
          </button>
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setPage(1)
            setDateFrom(event.target.value)
          }}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => {
            setPage(1)
            setDateTo(event.target.value)
          }}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
        />
        <select
          value={selectedEmployee}
          onChange={(event) => {
            setPage(1)
            setSelectedEmployee(event.target.value)
          }}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onApply}
          className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onExport}
          className="text-sm text-slate-700 hover:text-slate-900 font-semibold"
        >
          Export CSV
        </button>
      </div>
    </div>
  )
}
