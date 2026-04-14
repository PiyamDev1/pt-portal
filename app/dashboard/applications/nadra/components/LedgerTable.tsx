/**
 * Module: app/dashboard/applications/nadra/components/LedgerTable.tsx
 * Dashboard module for applications/nadra/components/LedgerTable.tsx.
 */

import { getStatusColor, getNadraRecord, getDetails } from './helpers'
import type { NadraApplication, NadraFamilyGroup, NadraPerson } from '@/app/types/nadra'

interface LedgerTableProps {
  groupedData: Record<string, NadraFamilyGroup>
  isUpdating: boolean
  onStatusChange: (nadraId: string, newStatus: string) => void
  onMarkRefund: (nadraId: string) => void
  onEditApplication: (item: NadraApplication) => void
  onEditHead: (head: NadraPerson) => void
  onAddMember: (head: NadraPerson) => void
  onViewHistory: (item: NadraApplication) => void
  onOpenNotes: (item: NadraApplication) => void
  isNoteUnread: (item: NadraApplication) => boolean
  onOpenComplaint: (item: NadraApplication) => void
  onGenerateReceipt: (item: NadraApplication) => void
  onManageDocuments?: (familyHeadId: string, familyHeadName: string) => void
}

export default function LedgerTable({
  groupedData,
  isUpdating,
  onStatusChange,
  onMarkRefund,
  onEditApplication,
  onEditHead,
  onAddMember,
  onViewHistory,
  onOpenNotes,
  isNoteUnread,
  onOpenComplaint,
  onGenerateReceipt,
  onManageDocuments,
}: LedgerTableProps) {
  const groupedEntries = Object.entries(groupedData) as [string, NadraFamilyGroup][]

  const canOpenComplaintForStatus = (status: string) => {
    const normalizedStatus = String(status || '')
      .trim()
      .toLowerCase()
    return (
      normalizedStatus === 'submitted' ||
      normalizedStatus.includes('progress') ||
      normalizedStatus.includes('process')
    )
  }

  return (
    <div className="space-y-4">
      {groupedEntries.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 italic"
          role="status"
          aria-live="polite"
        >
          No records found.
        </div>
      ) : (
        groupedEntries.map(([headCnic, group]) => (
          <div
            key={headCnic}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* GROUP HEADER */}
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏠</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    {group.head
                      ? `${group.head.first_name} ${group.head.last_name}`
                      : 'No Family Head'}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase">
                    <span>{headCnic}</span>
                    {group.head?.phone_number && (
                      <span className="text-slate-500 font-sans normal-case">
                        • 📞 {group.head.phone_number}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Center: Document Management Button */}
              <div className="flex-1 flex justify-center">
                {group.head && (
                  <button
                    onClick={() =>
                      onManageDocuments?.(
                        group.head!.id,
                        `${group.head!.first_name} ${group.head!.last_name}`,
                      )
                    }
                    className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1"
                    type="button"
                    aria-label="Manage family documents"
                  >
                    <span>📄</span>
                    <span>Manage Documents</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {group.head && (
                  <button
                    onClick={() => onEditHead(group.head!)}
                    className="text-xs text-slate-600 underline hover:text-blue-600"
                    type="button"
                    aria-label="Modify family head"
                  >
                    Modify Head
                  </button>
                )}
                {group.head && (
                  <button
                    onClick={() => onAddMember(group.head!)}
                    className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50 font-bold transition flex items-center gap-1"
                    type="button"
                    aria-label="Add member"
                  >
                    <span>+</span> Add Member
                  </button>
                )}
              </div>
            </div>

            {/* Temp banner when family head has no applications */}
            {group.members.length === 0 && (
              <div className="mx-6 mt-3 mb-0 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                No applications yet for this family head. Add the first application to link the
                account and this banner will disappear.
              </div>
            )}

            {/* ROWS */}
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {group.members.length === 0 && (
                  <tr>
                    <td className="p-6 text-slate-500 italic" colSpan={5}>
                      No members yet.
                      {group.head && (
                        <>
                          {' '}
                          <button
                            onClick={() => onAddMember(group.head as NadraPerson)}
                            className="underline text-blue-600 hover:text-blue-800 font-semibold"
                            type="button"
                            aria-label="Add family member"
                          >
                            Add a member to this family head
                          </button>
                          .
                        </>
                      )}
                    </td>
                  </tr>
                )}
                {group.members.map((item) => {
                  const nadraRecord = getNadraRecord(item)
                  const assignedEmployee = Array.isArray(nadraRecord?.employees)
                    ? nadraRecord?.employees[0]
                    : nadraRecord?.employees
                  const details = getDetails(nadraRecord)
                  const status = nadraRecord?.status || 'Pending Submission'
                  const isCancelled = String(status).trim().toLowerCase() === 'cancelled'
                  const isRefunded = !!nadraRecord?.is_refunded
                  const canLaunchComplaint = canOpenComplaintForStatus(status)
                  const hasNotes = Boolean(String(nadraRecord?.notes || '').trim())
                  const hasUnreadNotes = isNoteUnread(item)

                  return (
                    <tr
                      key={item.id || `${headCnic}-placeholder`}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-4 pl-12 align-top">
                        <div className="flex items-start gap-3">
                          <span className="text-slate-400 font-light">¬</span>
                          <div>
                            <div className="font-bold text-slate-800 text-base">
                              {item.applicants?.first_name} {item.applicants?.last_name}
                            </div>
                            <div className="text-sm text-slate-600 font-mono mt-0.5 tracking-wide">
                              {item.applicants?.citizen_number}
                            </div>
                            <div className="text-xs text-blue-500 mt-1">
                              {item.applicants?.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-700">{nadraRecord?.service_type}</div>
                        <div className="text-xs text-slate-500 font-medium mt-1">
                          {details?.service_option || 'Standard Processing'}
                        </div>
                        {assignedEmployee?.full_name && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-blue-50 border border-blue-100 px-2 py-1 rounded text-xs text-blue-700">
                            <span>👤</span>
                            <span className="font-medium">{assignedEmployee.full_name}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <button
                          onClick={() => onViewHistory(item)}
                          className="font-mono text-slate-800 font-bold tracking-wide text-sm hover:underline block"
                          type="button"
                          aria-label="View application history"
                        >
                          {nadraRecord?.tracking_number || item.tracking_number}
                        </button>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 font-bold uppercase">PIN:</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-sm font-mono font-bold text-slate-700 border border-slate-200">
                            {nadraRecord?.application_pin || 'N/A'}
                          </span>
                        </div>
                        {nadraRecord?.created_at && (
                          <div className="text-xs text-slate-500 mt-2">
                            {new Date(nadraRecord.created_at).toLocaleDateString('en-GB')}
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <select
                          disabled={isUpdating}
                          value={status}
                          onChange={(e) => {
                            if (!nadraRecord?.id) return
                            onStatusChange(nadraRecord.id, e.target.value)
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:ring-0 ${getStatusColor(
                            status,
                          )}`}
                        >
                          <option value="Pending Submission">Pending Submission</option>
                          <option value="Submitted">Submitted</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Under Process">Under Process</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                        {isRefunded && (
                          <div className="mt-2 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                            Refunded
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top w-48 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {canLaunchComplaint && (
                            <button
                              onClick={() => onOpenComplaint(item)}
                              className="h-8 px-3 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-700 transition text-xs font-semibold border border-amber-200 whitespace-nowrap"
                              type="button"
                              aria-label="Launch complaint"
                            >
                              Complaint
                            </button>
                          )}
                          <button
                            onClick={() => onGenerateReceipt(item)}
                            disabled={isUpdating}
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition border border-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            type="button"
                            aria-label="Generate receipt"
                            title="Generate receipt"
                          >
                            🧾
                          </button>
                          {isCancelled && (
                            <button
                              onClick={() => {
                                if (!nadraRecord?.id) return
                                onMarkRefund(nadraRecord.id)
                              }}
                              disabled={isUpdating || isRefunded}
                              className={`h-8 px-3 flex items-center justify-center rounded-full transition text-xs font-semibold border whitespace-nowrap ${
                                isRefunded
                                  ? 'bg-rose-100 text-rose-500 border-rose-200 cursor-not-allowed'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                              }`}
                              type="button"
                              aria-label="Mark refunded"
                              title={isRefunded ? 'Already refunded' : 'Mark refunded'}
                            >
                              {isRefunded ? 'Refunded' : 'Refund'}
                            </button>
                          )}
                          <button
                            onClick={() => onOpenNotes(item)}
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition relative"
                            type="button"
                            aria-label="Open notes"
                            title={
                              hasUnreadNotes
                                ? 'Application notes (unread)'
                                : hasNotes
                                  ? 'Application notes (has notes)'
                                  : 'Application notes'
                            }
                          >
                            📝
                            {hasUnreadNotes ? (
                              <span
                                className="absolute -top-2 -right-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white"
                                aria-hidden="true"
                              >
                                NEW
                              </span>
                            ) : hasNotes ? (
                              <span
                                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                          <button
                            onClick={() => onEditApplication(item)}
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition"
                            type="button"
                            aria-label="Edit application"
                          >
                            ✎
                          </button>
                        </div>
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
