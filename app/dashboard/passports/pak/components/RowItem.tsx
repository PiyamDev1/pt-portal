import React from 'react'
import MiniTracking from './MiniTracking'
import { getPassportRecord, getTrackingSteps, getCurrentStepIndex, getStatusColor } from './utils'
import { toast } from 'sonner'

export default function RowItem({
  item,
  onOpenEdit,
  onOpenArrival,
  onViewHistory,
  onStatusChange,
  onToggleFingerprints,
  onReturnCustody,
  onMarkCollected
}: any) {
  const pp = getPassportRecord(item)
  if (!pp) return null
  const steps = getTrackingSteps(pp)
  const currentStep = getCurrentStepIndex(pp)

  return (
    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
      <td className="p-5">
        <div className="font-bold text-base text-slate-800">{item.applicants?.first_name} {item.applicants?.last_name}</div>
        <div className="text-xs text-slate-500 font-mono mt-1">{item.applicants?.citizen_number}</div>
      </td>
      <td className="p-5">
        <div className="flex flex-col gap-1.5">
          <span className="font-bold text-slate-700">{pp.application_type}</span>
          {pp.speed === 'Executive' ? (
            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200 w-fit">Executive</span>
          ) : (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium border border-slate-200 w-fit">Normal</span>
          )}
          <div className="text-xs text-slate-500">{pp.category} • {pp.page_count}</div>
        </div>
      </td>
      <td className="p-5">
        <div className="space-y-2">
          <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 w-fit">
            {item.tracking_number}
          </div>
          <MiniTracking steps={steps} currentStep={currentStep} />
        </div>
      </td>
      <td className="p-5 bg-blue-50/30 border-l border-r border-blue-100">
        <div className="space-y-3">
          {pp.old_passport_number && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Old Passport #</label>
              <div className="flex items-center gap-2">
                <div className="font-mono text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 flex-1">
                  {pp.old_passport_number}
                </div>
                {pp.old_passport_custody && (
                  <button
                    onClick={() => onReturnCustody(pp.id)}
                    className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded border border-amber-300 hover:bg-amber-200 font-bold"
                    title="Mark as returned"
                  >
                    Return
                  </button>
                )}
                {!pp.old_passport_custody && (
                  <span className="text-[10px] text-green-600 font-bold">✓ Returned</span>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">New Passport #</label>
            {pp.new_passport_number ? (
              <div className="font-mono text-sm font-bold text-slate-700 bg-white px-2 py-1.5 rounded border border-slate-200">
                {pp.new_passport_number}
              </div>
            ) : (
              <button
                onClick={() => onOpenArrival(item)}
                className="w-full text-left px-2 py-1.5 text-sm border border-dashed border-slate-300 rounded text-slate-400 hover:border-blue-400 hover:text-blue-600 transition bg-white"
              >
                Enter Number
              </button>
            )}
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={pp.status === 'Collected'}
              onChange={(e) => {
                if (!pp.new_passport_number) {
                  toast.error('Enter new passport number first')
                  return
                }
                onMarkCollected(pp.id)
              }}
              disabled={!pp.new_passport_number}
              id={`collected-${pp.id}`}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor={`collected-${pp.id}`} className={`ml-2 text-sm cursor-pointer ${!pp.new_passport_number ? 'text-slate-400' : 'text-slate-700'}`}>
              Collected by Customer
            </label>
          </div>
        </div>
      </td>
      <td className="p-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <select
            value={pp.status}
            onChange={(e) => onStatusChange(pp.id, e.target.value)}
            className={`text-xs font-bold uppercase rounded-md py-1 px-2 border cursor-pointer ${getStatusColor(pp.status)}`}
          >
            <option value="Pending Submission">Pending Submission</option>
            <option value="Processing">Processing</option>
            <option value="Passport Arrived">Passport Arrived</option>
            <option value="Collected">Collected</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pp.fingerprints_completed}
              onChange={() => onToggleFingerprints(pp.id, pp.fingerprints_completed)}
              id={`fp-${pp.id}`}
              className="h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer"
            />
            <label htmlFor={`fp-${pp.id}`} className="text-xs text-slate-600 cursor-pointer">Biometrics</label>
          </div>
          <button onClick={() => onViewHistory(item.id, item.tracking_number)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            View History
          </button>
        </div>
      </td>
      <td className="p-5 text-right">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onOpenEdit(item)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition shadow-sm"
            title="Edit Record"
          >
            ✏️
          </button>
        </div>
      </td>
    </tr>
  )
}
