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
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <label htmlFor="nadra-search" className="sr-only">Search applications</label>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            id="nadra-search"
            type="text"
            placeholder="Search by CNIC, Name, or Tracking Number..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 transition"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search by CNIC, name, or tracking number"
          />
        </div>
        <div className="w-full md:w-40">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 font-bold text-slate-600 px-4 cursor-pointer"
            aria-label="Filter by status"
          >
            <option value="All">All Statuses</option>
            <option value="Pending Submission">Pending</option>
            <option value="Submitted">Submitted</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div className="w-full md:w-40">
          <select
            value={serviceTypeFilter}
            onChange={(e) => onServiceTypeChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 text-slate-600 px-4 cursor-pointer text-xs"
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
            className="w-full h-full py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 text-slate-600 px-4 cursor-pointer text-xs"
            aria-label="Filter by service option"
          >
            <option value="All">All Options</option>
            <option value="Normal">Normal</option>
            <option value="Urgent">Urgent</option>
            <option value="Express">Express</option>
          </select>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-slate-600">Date Range (DD/MM/YYYY):</label>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={startDate} 
            onChange={e => onStartDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-50 border-none rounded-lg text-sm"
            maxLength={10}
            aria-label="Start date"
          />
          <span className="text-slate-400">to</span>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={endDate} 
            onChange={e => onEndDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-50 border-none rounded-lg text-sm"
            maxLength={10}
            aria-label="End date"
          />
          {(startDate || endDate) && (
            <button 
              onClick={() => { onStartDateChange(''); onEndDateChange('') }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
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
            className="h-4 w-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"
          />
          <label htmlFor="show-empty-families" className="text-sm text-slate-600 cursor-pointer">
            Show family heads with no members
          </label>
        </div>
      </div>
    </div>
  )
}
