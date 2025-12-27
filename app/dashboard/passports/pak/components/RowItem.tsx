'use client'

import { useState } from 'react'
import { MoreHorizontal, User, FileText, Fingerprint } from 'lucide-react'
import { getPassportRecord } from './utils'
import MiniTracking from './MiniTracking' // Ensure you have this or the previous code for it

export default function RowItem({ item, onOpenEdit, onUpdateRecord, onViewHistory }: any) {
  const pp = getPassportRecord(item)
  const [ppNum, setPpNum] = useState(pp?.new_passport_number || '')

  // Render Badges
  const typeBadge = pp?.speed === 'Executive' 
    ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">EXECUTIVE</span>
    : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">NORMAL</span>

  // Status Colors
  const statusColors: any = {
    'Pending Submission': 'bg-gray-100 text-gray-600',
    'Biometrics Taken': 'bg-blue-100 text-blue-700',
    'Processing': 'bg-yellow-100 text-yellow-700',
    'Passport Arrived': 'bg-indigo-100 text-indigo-700',
    'Collected': 'bg-green-100 text-green-700'
  }
  
  // Handlers for inline updates
  const handleStatusChange = (newStatus: string) => {
    onUpdateRecord(pp.id, { status: newStatus })
  }

  const handlePassportNumBlur = () => {
    if (ppNum !== pp?.new_passport_number) {
       // Save when user clicks away
       onUpdateRecord(pp.id, { 
         status: ppNum ? 'Passport Arrived' : pp.status,
         newPassportNo: ppNum 
       })
    }
  }

  const handleCollectionChange = (checked: boolean) => {
      onUpdateRecord(pp.id, { 
          status: checked ? 'Collected' : 'Passport Arrived',
          isCollected: checked 
      })
  }

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      {/* 1. Applicant */}
      <td className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm">{item.applicants?.first_name} {item.applicants?.last_name}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{item.applicants?.citizen_number}</div>
          </div>
        </div>
      </td>

      {/* 2. Passport Details */}
      <td className="p-5">
        <div className="space-y-1.5">
           <div className="text-sm font-medium text-slate-700">{pp?.application_type}</div>
           <div className="flex gap-2">{typeBadge}</div>
        </div>
      </td>

      {/* 3. Tracking History */}
      <td className="p-5">
         {/* Reusing your MiniTracking or a simple list */}
         <div className="flex flex-col gap-1">
             {['Pending Submission', 'Biometrics Taken', 'Processing', 'Passport Arrived', 'Collected'].map((step, i) => {
                 // Determine if active based on status string
                 const statusOrder = ['Pending Submission', 'Biometrics Taken', 'Processing', 'Passport Arrived', 'Collected'];
                 const currentIdx = statusOrder.indexOf(pp?.status || 'Pending Submission');
                 const isCompleted = i <= currentIdx;

                 return (
                    <div key={step} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-slate-200'}`} />
                        <span className={`text-[10px] uppercase font-semibold ${isCompleted ? 'text-slate-600' : 'text-slate-300'}`}>{step}</span>
                    </div>
                 )
             })}
         </div>
      </td>

      {/* 4. Arrival & Collection (NEW) */}
      <td className="p-5 bg-blue-50/30 border-l border-r border-blue-100">
          <div className="space-y-3">
             {/* Passport Number Input */}
             <div>
                 <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">New Passport #</label>
                 <div className="relative">
                     <FileText className="absolute left-2 top-1.5 w-3.5 h-3.5 text-slate-400" />
                     <input 
                       className="w-full pl-7 pr-2 py-1 text-xs border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                       placeholder="Enter Number"
                       value={ppNum}
                       onChange={e => setPpNum(e.target.value)}
                       onBlur={handlePassportNumBlur}
                     />
                 </div>
             </div>
             
             {/* Collected Checkbox */}
             <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${!ppNum ? 'opacity-50 pointer-events-none' : ''}`}>
                 <input 
                   type="checkbox" 
                   checked={pp?.status === 'Collected'} 
                   onChange={(e) => handleCollectionChange(e.target.checked)}
                   className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
                 />
                 <span className={pp?.status === 'Collected' ? 'text-green-700' : 'text-slate-600'}>
                    Collected by Customer
                 </span>
             </label>
          </div>
      </td>

      {/* 5. Status Selector */}
      <td className="p-5 text-center">
        <select 
            value={pp?.status || 'Pending Submission'} 
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`text-xs font-bold px-2 py-1 rounded-full border-0 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 ${statusColors[pp?.status] || 'bg-slate-100'}`}
        >
            <option value="Pending Submission">Pending Submission</option>
            <option value="Biometrics Taken">Biometrics Taken</option>
            <option value="Processing">Processing</option>
            <option value="Passport Arrived">Passport Arrived</option>
            <option value="Collected">Collected</option>
        </select>
        <div 
            onClick={() => onViewHistory(item.id, item.tracking_number)}
            className="text-[10px] text-slate-400 mt-2 underline cursor-pointer hover:text-blue-500"
        >
            View History
        </div>
      </td>

      {/* 6. Actions */}
      <td className="p-5 text-right">
        <button 
           onClick={() => onOpenEdit(item)} 
           className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
        >
           <MoreHorizontal className="w-5 h-5" />
        </button>
      </td>
    </tr>
  )
}
