import type { Dispatch, SetStateAction } from 'react'

type PassportsToolbarProps = {
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
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
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  showForm,
  setShowForm,
}: PassportsToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex-grow w-full flex flex-col md:flex-row gap-3">
        <div className="relative flex-grow md:max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracking, CNIC, or names..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex gap-2 items-center">
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
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => setShowForm((prev) => !prev)}
        className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-md transition"
      >
        {showForm ? 'Close Form' : '+ New Application'}
      </button>
    </div>
  )
}
