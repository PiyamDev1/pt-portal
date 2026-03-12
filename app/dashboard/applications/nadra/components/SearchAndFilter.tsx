interface SearchAndFilterProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: string
  onStatusChange: (status: string) => void
  serviceTypeFilter: string
  onServiceTypeChange: (serviceType: string) => void
  serviceOptionFilter: string
  onServiceOptionChange: (serviceOption: string) => void
  startDate: string
  onStartDateChange: (date: string) => void
  endDate: string
  onEndDateChange: (date: string) => void
  showEmptyFamilies: boolean
  onToggleEmptyFamilies: (show: boolean) => void
}

export default function SearchAndFilter({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  serviceTypeFilter,
  onServiceTypeChange,
  serviceOptionFilter,
  onServiceOptionChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  showEmptyFamilies,
  onToggleEmptyFamilies
}: SearchAndFilterProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 shadow-sm space-y-3 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.18),transparent_40%),radial-gradient(circle_at_85%_10%,rgba(34,197,94,0.14),transparent_45%)]" />
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <label htmlFor="nadra-search" className="sr-only">Search applications</label>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-300">🔍</span>
          <input
            id="nadra-search"
            type="text"
            placeholder="Search by CNIC, Name, or Tracking Number..."
            className="relative w-full pl-10 pr-4 py-3 bg-slate-900/70 border border-emerald-500/20 text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-300 transition placeholder:text-slate-400"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search by CNIC, name, or tracking number"
          />
        </div>
        <div className="w-full md:w-40">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-900/70 border border-emerald-500/20 rounded-xl focus:ring-2 focus:ring-emerald-400 font-bold text-slate-100 px-4 cursor-pointer"
            aria-label="Filter by status"
          >
            <option value="All">All Statuses</option>
            <option value="Pending Submission">Pending</option>
            <option value="Submitted">Submitted</option>
            <option value="In Progress">In Progress</option>
            <option value="Under Process">Under Process</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div className="w-full md:w-40">
          <select
            value={serviceTypeFilter}
            onChange={(e) => onServiceTypeChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-900/70 border border-emerald-500/20 rounded-xl focus:ring-2 focus:ring-emerald-400 text-slate-100 px-4 cursor-pointer text-xs"
            aria-label="Filter by service type"
          >
            <option value="All">All Service Types</option>
            <option value="NICOP/CNIC">NICOP/CNIC</option>
            <option value="FAMILY REGISTRATION">Family Registration</option>
            <option value="POLICE VERIFICATION">Police Verification</option>
          </select>
        </div>
        <div className="w-full md:w-40">
          <select
            value={serviceOptionFilter}
            onChange={(e) => onServiceOptionChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-900/70 border border-emerald-500/20 rounded-xl focus:ring-2 focus:ring-emerald-400 text-slate-100 px-4 cursor-pointer text-xs"
            aria-label="Filter by service option"
          >
            <option value="All">All Options</option>
            <option value="Normal">Normal</option>
            <option value="Executive">Executive</option>
            <option value="Upgrade to Fast">Upgrade to Fast</option>
            <option value="Modification">Modification</option>
            <option value="Reprint">Reprint</option>
            <option value="Cancellation">Cancellation</option>
          </select>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-slate-200">Date Range (DD/MM/YYYY):</label>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={startDate} 
            onChange={e => onStartDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-900/70 border border-emerald-500/20 rounded-lg text-sm text-slate-100 placeholder:text-slate-400"
            maxLength={10}
            aria-label="Start date"
          />
          <span className="text-slate-400">to</span>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={endDate} 
            onChange={e => onEndDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-900/70 border border-emerald-500/20 rounded-lg text-sm text-slate-100 placeholder:text-slate-400"
            maxLength={10}
            aria-label="End date"
          />
          {(startDate || endDate) && (
            <button 
              onClick={() => { onStartDateChange(''); onEndDateChange('') }}
              className="text-xs text-emerald-300 hover:text-emerald-200 underline"
              type="button"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          <input 
            type="checkbox" 
            id="show-empty-families"
            checked={showEmptyFamilies}
            onChange={e => onToggleEmptyFamilies(e.target.checked)}
            className="h-4 w-4 text-emerald-500 rounded focus:ring-emerald-500 cursor-pointer"
          />
          <label htmlFor="show-empty-families" className="text-sm text-slate-200 cursor-pointer">
            Show family heads with no members
          </label>
        </div>
      </div>
    </div>
  )
}
