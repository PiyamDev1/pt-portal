interface SearchAndFilterProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: string
  onStatusChange: (status: string) => void
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search by CNIC, Name, or Tracking Number..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 transition"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full h-full py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 font-bold text-slate-600 px-4 cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Pending Submission">Pending</option>
            <option value="Submitted">Submitted</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-slate-600">Date Range:</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => onStartDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-50 border-none rounded-lg text-sm"
            placeholder="From"
          />
          <span className="text-slate-400">to</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => onEndDateChange(e.target.value)}
            className="px-3 py-2 bg-slate-50 border-none rounded-lg text-sm"
            placeholder="To"
          />
          {(startDate || endDate) && (
            <button 
              onClick={() => { onStartDateChange(''); onEndDateChange('') }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
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
