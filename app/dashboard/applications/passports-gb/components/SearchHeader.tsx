'use client'

import { Plus, Search } from 'lucide-react'

interface SearchHeaderProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  showForm: boolean
  onToggleForm: () => void
}

export default function SearchHeader({ searchTerm, onSearchChange, showForm, onToggleForm }: SearchHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="relative w-full md:w-96">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          placeholder="Search by Name, PEX, etc..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
        />
      </div>
      <button
        onClick={onToggleForm}
        className="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-slate-800 flex items-center gap-2 shadow-md"
      >
        <Plus className="w-4 h-4" /> {showForm ? 'Close' : 'New Application'}
      </button>
    </div>
  )
}
