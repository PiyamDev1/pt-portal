'use client'

import { useState } from 'react'
import { MoreHorizontal, User } from 'lucide-react'
import { getPassportRecord } from './utils'

export default function RowItem({ item, onOpenEdit, onUpdateRecord, onViewHistory, onOpenArrival }: any) {
  const pp = getPassportRecord(item)
  if (!pp) return null

  // Status Colors
  const statusColors: any = {
    'Pending Submission': 'bg-gray-100 text-gray-600',
    'Biometrics Taken': 'bg-blue-100 text-blue-700',
    'Processing': 'bg-yellow-100 text-yellow-700',
    'Passport Arrived': 'bg-indigo-100 text-indigo-700',
    'Collected': 'bg-green-100 text-green-700'
  }
  
  const handleStatusChange = (newStatus: string) => {
    onUpdateRecord(pp.id, { status: newStatus })
  }

  const handleCollectionChange = (checked: boolean) => {
    onUpdateRecord(pp.id, { 
      status: checked ? 'Collected' : 'Passport Arrived'
    })
  }

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      {/* Applicant */}
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm">{item.applicants?.first_name} {item.applicants?.last_name}</div>
            <div className="text-xs text-slate-500 font-mono">{item.applicants?.citizen_number}</div>
          </div>
        </div>
      </td>

      {/* Tracking Number - Clickable */}
      <td className="p-4">
        <button
          onClick={() => onViewHistory(item.id, item.tracking_number)}
          className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm"
        >
          {item.tracking_number}
        </button>
      </td>

      {/* Old Passport */}
      <td className="p-4">
        {pp.old_passport_number ? (
          <div className="font-mono text-sm text-slate-700">{pp.old_passport_number}</div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>

      {/* Passport Details */}
      <td className="p-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-700">{pp.application_type}</div>
          <div className="text-xs text-slate-500">{pp.category}</div>
          {pp.speed === 'Executive' && (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">EXECUTIVE</span>
          )}
        </div>
      </td>

      {/* New Passport & Collection */}
      <td className="p-4 bg-blue-50/30 border-l border-r border-blue-100">
        <div className="space-y-2">
          {pp.new_passport_number ? (
            <div className="font-mono font-bold text-slate-700 text-sm">{pp.new_passport_number}</div>
          ) : (
            <button
              onClick={() => onOpenArrival(item)}
              className="text-xs px-3 py-1.5 rounded border border-dashed border-slate-300 text-slate-500 hover:border-blue-500 hover:text-blue-600 transition"
            >
              + Enter Passport #
            </button>
          )}
          
          {pp.new_passport_number && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={pp.status === 'Collected'}
                onChange={(e) => handleCollectionChange(e.target.checked)}
                className="h-4 w-4 text-green-600 rounded"
              />
              <span className={pp.status === 'Collected' ? 'text-green-700 font-medium' : 'text-slate-600'}>
                Collected
              </span>
            </label>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="p-4 text-center">
        <select 
          value={pp.status || 'Pending Submission'}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={`text-xs font-bold px-2 py-1 rounded border-0 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 ${statusColors[pp.status] || 'bg-slate-100'}`}
        >
          <option value="Pending Submission">Pending Submission</option>
          <option value="Biometrics Taken">Biometrics Taken</option>
          <option value="Processing">Processing</option>
          <option value="Passport Arrived">Passport Arrived</option>
          <option value="Collected">Collected</option>
        </select>
      </td>

      {/* Actions */}
      <td className="p-4 text-right">
        <button 
          onClick={() => onOpenEdit(item)}
          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}
