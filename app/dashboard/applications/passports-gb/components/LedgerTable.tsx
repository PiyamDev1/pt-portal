'use client'

import { MoreHorizontal, User, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface LedgerTableProps {
  items: any[]
  onStatusChange: (id: string, newStatus: string) => void
  onViewHistory: (item: any) => void
  onEdit: (item: any) => void
}

export default function LedgerTable({ items, onStatusChange, onViewHistory, onEdit }: LedgerTableProps) {
  const formatName = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)} ${lastName.charAt(0).toUpperCase()}${lastName.slice(1)}`
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-100">
          <tr>
            <th className="p-4">Applicant</th>
            <th className="p-4">Phone</th>
            <th className="p-4">Service Details</th>
            <th className="p-4">PEX Ref</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((item: any) => (
            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">
                      {item.applicants?.first_name && item.applicants?.last_name
                        ? formatName(item.applicants.first_name, item.applicants.last_name)
                        : 'N/A'}
                    </div>
                    {item.applicants?.date_of_birth && (
                      <div className="mt-1.5">
                        <span className="inline-block bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded">
                          {new Date(item.applicants.date_of_birth).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <span className="text-sm text-slate-700">
                  {item.applicants?.phone_number || 'N/A'}
                </span>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">{item.service_type}</div>
                  <div className="flex gap-2">
                    <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                      {item.age_group}
                    </span>
                    <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                      {item.pages} Pages
                    </span>
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.pex_number || 'N/A')
                      toast.success('PEX number copied to clipboard')
                    }}
                    className="font-mono text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    {item.pex_number || 'N/A'}
                  </button>
                  <div className="text-[10px] text-slate-500">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB') : 'N/A'}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <select
                  value={item.status || 'Pending Submission'}
                  onChange={(e) => onStatusChange(item.id, e.target.value)}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase border cursor-pointer
                    ${item.status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`}
                >
                  <option value="Pending Submission">Pending Submission</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </td>
              <td className="p-4 text-right">
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => onViewHistory(item)}
                    className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded transition-colors"
                    title="View History"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onEdit(item)}
                    className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
