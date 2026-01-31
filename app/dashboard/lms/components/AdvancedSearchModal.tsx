'use client'

import { useState } from 'react'
import { X, Calendar, DollarSign, Filter } from 'lucide-react'
import { handleDateInput as coreHandleDateInput } from '@/app/lib/utils'
import { formatToISODate } from '@/app/lib/dateFormatter'
import { ModalWrapper } from './ModalWrapper'

interface AdvancedSearchModalProps {
  onClose: () => void
  onApplyFilters: (filters: SearchFilters) => void
  currentFilters: SearchFilters
}

export interface SearchFilters {
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
  hasOverdue?: boolean
  hasDueSoon?: boolean
}

export function AdvancedSearchModal({ onClose, onApplyFilters, currentFilters }: AdvancedSearchModalProps) {
  const [filters, setFilters] = useState<SearchFilters>(currentFilters)

  // Use centralized handleDateInput utility
  const handleDateInput = coreHandleDateInput

  const formatToDisplayDate = (isoDate: string): string => {
    if (!isoDate) return ''
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const handleApply = () => {
    onApplyFilters(filters)
    onClose()
  }

  const handleClear = () => {
    setFilters({})
    onApplyFilters({})
    onClose()
  }

  return (
    <ModalWrapper onClose={onClose} title="Advanced Search">
      <div className="space-y-4">
        {/* Date Range */}
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-800">Date Range</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From (DD/MM/YYYY)</label>
              <input
                type="text"
                placeholder="01/01/2026"
                value={filters.dateFrom ? formatToDisplayDate(filters.dateFrom) : ''}
                onChange={(e) => {
                  const formatted = handleDateInput(e.target.value)
                  setFilters({ ...filters, dateFrom: formatted.length === 10 ? formatToISODate(formatted) : undefined })
                }}
                maxLength={10}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To (DD/MM/YYYY)</label>
              <input
                type="text"
                placeholder="31/12/2026"
                value={filters.dateTo ? formatToDisplayDate(filters.dateTo) : ''}
                onChange={(e) => {
                  const formatted = handleDateInput(e.target.value)
                  setFilters({ ...filters, dateTo: formatted.length === 10 ? formatToISODate(formatted) : undefined })
                }}
                maxLength={10}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Amount Range */}
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-800">Balance Range</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min (£)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.minAmount || ''}
                onChange={(e) => setFilters({ ...filters, minAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max (£)</label>
              <input
                type="number"
                step="0.01"
                placeholder="10000.00"
                value={filters.maxAmount || ''}
                onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-800">Status</h3>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.hasOverdue || false}
                onChange={(e) => setFilters({ ...filters, hasOverdue: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Only Overdue Accounts</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.hasDueSoon || false}
                onChange={(e) => setFilters({ ...filters, hasDueSoon: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Only Due Soon Accounts</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={handleClear}
            className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}
