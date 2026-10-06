'use client'

import { History } from 'lucide-react'
import type { TravelPackageAuditEvent } from '@/app/types/packages'
import { formatDateTime, label } from './packageOperationsModel'

type PackageAuditHistoryPanelProps = {
  events: TravelPackageAuditEvent[]
}

export function PackageAuditHistoryPanel({ events }: PackageAuditHistoryPanelProps) {
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <article key={event.id} className="flex gap-3 border-b border-slate-200 pb-3">
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center bg-slate-100">
            <History className="h-4 w-4 text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{event.event_summary}</p>
            <p className="mt-1 text-xs text-slate-500">
              {label(event.event_type)} · {formatDateTime(event.created_at)}
            </p>
          </div>
        </article>
      ))}
      {events.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">No audit events yet.</p>
      )}
    </div>
  )
}
