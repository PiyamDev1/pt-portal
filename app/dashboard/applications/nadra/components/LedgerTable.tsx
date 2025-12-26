import { getStatusColor, getNadraRecord, getDetails } from './helpers'

interface LedgerTableProps {
  groupedData: Record<string, any>
  isUpdating: boolean
  onStatusChange: (nadraId: string, newStatus: string) => void
  onEditApplication: (item: any) => void
  onEditHead: (head: any) => void
  onAddMember: (head: any) => void
  onViewHistory: (item: any) => void
}

export default function LedgerTable({
  groupedData,
  isUpdating,
  onStatusChange,
  onEditApplication,
  onEditHead,
  onAddMember,
  onViewHistory
}: LedgerTableProps) {
  return (
    <div className="space-y-4">
      {Object.entries(groupedData).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 italic">
          No records found.
        </div>
      ) : (
        Object.entries(groupedData).map(([headCnic, group]: any) => (
          <div key={headCnic} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* GROUP HEADER */}
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏠</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    {group.head ? `${group.head.first_name} ${group.head.last_name}` : 'No Family Head'}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono uppercase">{headCnic}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {group.head && (
                  <button
                    onClick={() => onEditHead(group.head)}
                    className="text-xs text-slate-600 underline hover:text-blue-600"
                  >
                    Modify Head
                  </button>
                )}
                {group.head && (
                  <button
                    onClick={() => onAddMember(group.head)}
                    className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50 font-bold transition flex items-center gap-1"
                  >
                    <span>+</span> Add Member
                  </button>
                )}
              </div>
            </div>

            {/* ROWS */}
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {group.members.map((item: any) => {
                  const nadraRecord = getNadraRecord(item)
                  const details = getDetails(nadraRecord)

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-12 align-top">
                        <div className="flex items-start gap-3">
                          <span className="text-slate-300 font-light">¬</span>
                          <div>
                            <div className="font-bold text-slate-800 text-base">
                              {item.applicants?.first_name} {item.applicants?.last_name}
                            </div>
                            <div className="text-sm text-slate-600 font-mono mt-0.5 tracking-wide">
                              {item.applicants?.citizen_number}
                            </div>
                            <div className="text-xs text-blue-500 mt-1">{item.applicants?.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-700">{nadraRecord?.service_type}</div>
                        <div className="text-xs text-slate-500 font-medium mt-1">
                          {details?.service_option || 'Standard Processing'}
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <button
                          onClick={() => onViewHistory(item)}
                          className="font-mono text-slate-800 font-bold tracking-wide text-sm hover:underline block"
                        >
                          {nadraRecord?.tracking_number || item.tracking_number}
                        </button>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 font-bold uppercase">PIN:</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-sm font-mono font-bold text-slate-700 border border-slate-200">
                            {nadraRecord?.application_pin || 'N/A'}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <select
                          disabled={isUpdating}
                          value={nadraRecord?.status || 'Pending Submission'}
                          onChange={(e) => onStatusChange(nadraRecord?.id, e.target.value)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:ring-0 ${getStatusColor(
                            nadraRecord?.status || 'Pending Submission'
                          )}`}
                        >
                          <option value="Pending Submission">Pending Submission</option>
                          <option value="Submitted">Submitted</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>

                      <td className="p-4 align-top w-12 text-right">
                        <button
                          onClick={() => onEditApplication(item)}
                          className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition"
                        >
                          ✎
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
