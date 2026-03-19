/**
 * Module: app/dashboard/applications/passports/components/PassportsTable.tsx
 * Dashboard module for applications/passports/components/PassportsTable.tsx.
 */

import RowItem from './RowItem'
import type { Application, PakUpdateRecordPayload } from './types'

type PassportsTableProps = {
  filteredAppsLength: number
  pageItems: Application[]
  onOpenEdit: (item: Application) => void
  onUpdateRecord: (id: string, data: PakUpdateRecordPayload) => Promise<void>
  onViewHistory: (appId: string, trackingNo: string) => Promise<void>
  onOpenArrival: (item: Application) => void
  onManageDocuments: (applicationId: string, trackingNumber?: string) => void
  onOpenNotes: (applicationId: string, trackingNumber?: string) => Promise<void>
}

export default function PassportsTable({
  filteredAppsLength,
  pageItems,
  onOpenEdit,
  onUpdateRecord,
  onViewHistory,
  onOpenArrival,
  onManageDocuments,
  onOpenNotes,
}: PassportsTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
          <tr>
            <th scope="col" className="p-4">
              Applicant
            </th>
            <th scope="col" className="p-4">
              Tracking & Progress
            </th>
            <th scope="col" className="p-4 bg-blue-50/50 border-l border-r border-blue-100 w-56">
              Passports
            </th>
            <th scope="col" className="p-4">
              Details
            </th>
            <th scope="col" className="p-4 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredAppsLength === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="p-12 text-center text-slate-400 italic"
                role="status"
                aria-live="polite"
              >
                No records found. Try adjusting filters or add a new application.
              </td>
            </tr>
          ) : (
            pageItems.map((item) => (
              <RowItem
                key={item.id}
                item={item}
                onOpenEdit={onOpenEdit}
                onUpdateRecord={onUpdateRecord}
                onViewHistory={onViewHistory}
                onOpenArrival={onOpenArrival}
                onManageDocuments={onManageDocuments}
                onOpenNotes={onOpenNotes}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
