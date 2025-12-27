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

  const handleOldPassportReturn = (checked: boolean) => {
    onUpdateRecord(pp.id, { 
      status: pp.status,
      oldPassportReturned: checked
    })
  }

  // Workflow progress
  const workflow = [
    'Pending Submission',
    'Biometrics Taken',
    'Processing',
    'Passport Arrived',
    'Collected'
  ]
  const currentStepIdx = workflow.indexOf(pp.status || 'Pending Submission')

  // Toggle Switch Component
  const ToggleSwitch = ({ checked, onChange, disabled = false }: any) => (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
        checked ? 'bg-green-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      {/* Applicant */}
      <td className="p-4 align-top">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mt-0.5">
            <User className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-slate-800 text-sm leading-tight">{item.applicants?.first_name} {item.applicants?.last_name}</div>
            <div className="text-xs text-slate-500 font-mono leading-tight">{item.applicants?.citizen_number}</div>
            {item.created_at && (
              <div className="text-[11px] font-semibold text-orange-500 leading-tight">
                Added: {new Date(item.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Tracking History with Summary */}
      <td className="p-4">
        <button
          onClick={() => onViewHistory(item.id, item.tracking_number)}
          className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm mb-2 block"
        >
          {item.tracking_number}
        </button>
        <div className="flex flex-col gap-1">
          {workflow.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${i <= currentStepIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${i <= currentStepIdx ? 'text-gray-700' : 'text-gray-400'}`}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </td>

      {/* Old & New Passport Combined */}
      <td className="p-3 bg-blue-50/30 border-l border-r border-blue-100 align-top">
        <div className="space-y-3">
          {/* Old Passport Section */}
          {pp.old_passport_number && (
            <div className="pb-2 border-b border-blue-200">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Old Passport</div>
              <div className="font-mono text-sm font-bold text-slate-700 mb-2">{pp.old_passport_number}</div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <ToggleSwitch 
                  checked={!pp.is_old_passport_returned}
                  onChange={(val) => handleOldPassportReturn(!val)}
                />
                <span className={!pp.is_old_passport_returned ? 'text-amber-600 font-medium' : 'text-green-700 font-medium'}>
                  {!pp.is_old_passport_returned ? 'Pending Return' : 'Returned'}
                </span>
              </label>
            </div>
          )}

          {/* New Passport Section */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">New Passport</div>
            {pp.new_passport_number ? (
              <div className="font-mono font-bold text-slate-700 text-sm mb-2">{pp.new_passport_number}</div>
            ) : (
              <button
                onClick={() => onOpenArrival(item)}
                className="text-xs px-3 py-1.5 rounded border border-dashed border-slate-300 text-slate-500 hover:border-blue-500 hover:text-blue-600 transition w-full text-center mb-2"
              >
                + Enter Passport #
              </button>
            )}
            
            {pp.new_passport_number && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <ToggleSwitch 
                  checked={pp.status === 'Collected'}
                  onChange={handleCollectionChange}
                />
                <span className={pp.status === 'Collected' ? 'text-green-700 font-medium' : 'text-slate-600'}>
                  {pp.status === 'Collected' ? 'Collected' : 'Pending Collection'}
                </span>
              </label>
            )}
          </div>
        </div>
      </td>

      {/* Passport Details + Status */}
      <td className="p-4 align-top">
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">{pp.application_type}</div>
          <div className="text-xs text-slate-500">{pp.category}</div>
          {pp.speed === 'Executive' ? (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">EXECUTIVE</span>
          ) : (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">NORMAL</span>
          )}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500">Status</label>
            <select 
              value={pp.status || 'Pending Submission'}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`mt-1 text-xs font-bold px-2 py-1 rounded border-0 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 ${statusColors[pp.status] || 'bg-slate-100'}`}
            >
              <option value="Pending Submission">Pending Submission</option>
              <option value="Biometrics Taken">Biometrics Taken</option>
              <option value="Processing">Processing</option>
              <option value="Passport Arrived">Passport Arrived</option>
              <option value="Collected">Collected</option>
            </select>
          </div>
        </div>
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
