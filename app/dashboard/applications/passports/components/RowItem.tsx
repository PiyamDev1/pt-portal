'use client'

import { MoreHorizontal, User } from 'lucide-react'
import { toast } from 'sonner'
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
    if (pp.status === 'Collected') return
    if (newStatus === 'Collected') return
    onUpdateRecord(pp.id, { status: newStatus })
  }

  const confirmReturn = () => {
    if (pp.is_old_passport_returned) return
    const ok = window.confirm('Mark old passport as returned? This cannot be undone.')
    if (!ok) return
    onUpdateRecord(pp.id, { status: pp.status, oldPassportReturned: true })
  }

  const confirmCollected = () => {
    if (pp.status === 'Collected') return
    if (!pp.new_passport_number) {
      toast.error('Enter new passport number before marking collected')
      return
    }
    const ok = window.confirm('Mark as collected? This cannot be undone.')
    if (!ok) return
    onUpdateRecord(pp.id, { status: 'Collected' })
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

  const createdAt = item?.created_at || item?.applications?.created_at || pp?.created_at
  const formatDate = (d: any) => {
    try {
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return ''
      return dt.toISOString().slice(0, 10)
    } catch {
      return ''
    }
  }

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
            {pp.family_head_email && (
              <div className="text-[11px] text-sky-700 font-semibold leading-tight">
                FH Email: {pp.family_head_email}
              </div>
            )}
            {createdAt && (
              <div className="text-[11px] font-semibold text-orange-500 leading-tight">
                Added: {formatDate(createdAt)}
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
          type="button"
          aria-label="View tracking history"
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
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-bold text-slate-700">{pp.old_passport_number}</div>
                {pp.is_old_passport_returned ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded">Returned</span>
                ) : (
                  <button
                    onClick={confirmReturn}
                    className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-200"
                    type="button"
                    aria-label="Mark old passport returned"
                  >
                    Mark Returned
                  </button>
                )}
              </div>
            </div>
          )}

          {/* New Passport Section */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">New Passport</div>
            {pp.new_passport_number ? (
              <div className="flex items-center gap-2 mb-2">
                <div className="font-mono font-bold text-slate-700 text-sm">{pp.new_passport_number}</div>
                {pp.status === 'Collected' ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded">Collected</span>
                ) : (
                  <button
                    onClick={confirmCollected}
                    className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100"
                    type="button"
                    aria-label="Mark passport collected"
                  >
                    Mark Collected
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => onOpenArrival(item)}
                className="text-xs px-3 py-1.5 rounded border border-dashed border-slate-300 text-slate-500 hover:border-blue-500 hover:text-blue-600 transition w-full text-center mb-2"
                type="button"
                aria-label="Enter new passport number"
              >
                + Enter Passport #
              </button>
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
              disabled={pp.status === 'Collected'}
              className={`mt-1 text-xs font-bold px-2 py-1 rounded border-0 outline-none focus:ring-2 focus:ring-offset-1 ${pp.status === 'Collected' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${statusColors[pp.status] || 'bg-slate-100'}`}
              aria-label="Update status"
            >
              <option value="Pending Submission">Pending Submission</option>
              <option value="Biometrics Taken">Biometrics Taken</option>
              <option value="Processing">Processing</option>
              <option value="Passport Arrived">Passport Arrived</option>
              <option value="Collected" disabled>Collected (set via button)</option>
            </select>
          </div>
        </div>
      </td>

      {/* Actions */}
      <td className="p-4 text-right">
        <button 
          onClick={() => onOpenEdit(item)}
          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
          type="button"
          aria-label="Edit passport application"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}
