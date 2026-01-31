interface StatementFilter {
  type: string
  dateFrom: string
  dateTo: string
}

import { memo } from 'react'

interface TransactionFiltersProps {
  filter: StatementFilter
  setFilter: (filter: StatementFilter) => void
  handleDateInput: (value: string) => string
}

function TransactionFiltersComponent({ filter, setFilter, handleDateInput }: TransactionFiltersProps) {
  return (
    <div className="bg-slate-50 p-4 rounded-lg space-y-3 print:hidden">
      <h3 className="font-bold text-sm text-slate-700">Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">Transaction Type</label>
          <select 
            value={filter.type} 
            onChange={e => setFilter({...filter, type: e.target.value})}
            className="w-full p-2 border rounded text-sm"
          >
            <option value="">All Types</option>
            <option value="service">Debt Added</option>
            <option value="payment">Payment</option>
            <option value="fee">Fee</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">From Date (DD/MM/YYYY)</label>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={filter.dateFrom}
            onChange={e => setFilter({...filter, dateFrom: handleDateInput(e.target.value)})}
            className="w-full p-2 border rounded text-sm"
            maxLength={10}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">To Date (DD/MM/YYYY)</label>
          <input 
            type="text" 
            placeholder="DD/MM/YYYY"
            value={filter.dateTo}
            onChange={e => setFilter({...filter, dateTo: handleDateInput(e.target.value)})}
            className="w-full p-2 border rounded text-sm"
            maxLength={10}
          />
        </div>
      </div>
    </div>
  )
}

export const TransactionFilters = memo(TransactionFiltersComponent)
