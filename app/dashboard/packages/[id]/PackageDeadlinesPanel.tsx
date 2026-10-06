'use client'

import type { Dispatch, SetStateAction } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import type { TravelPackageDeadline } from '@/app/types/packages'
import { formatDateTime } from './packageOperationsModel'

export type PackageDeadlineForm = {
  title: string
  dueAt: string
  severity: string
}

type PackageDeadlinesPanelProps = {
  deadlines: TravelPackageDeadline[]
  deadlineForm: PackageDeadlineForm
  setDeadlineForm: Dispatch<SetStateAction<PackageDeadlineForm>>
  onCreateDeadline: (body: Record<string, unknown>) => void | Promise<void>
  onMarkDeadlineMet: (deadlineId: string) => void | Promise<void>
}

export function PackageDeadlinesPanel({
  deadlines,
  deadlineForm,
  setDeadlineForm,
  onCreateDeadline,
  onMarkDeadlineMet,
}: PackageDeadlinesPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black">Deadlines</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateDeadline(deadlineForm)
        }}
        className="grid gap-2 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_11rem_8rem_auto]"
      >
        <input
          placeholder="Deadline title"
          value={deadlineForm.title}
          onChange={(event) =>
            setDeadlineForm((current) => ({ ...current, title: event.target.value }))
          }
          className="border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <label className="text-[11px] font-bold uppercase text-slate-500">
          Due date
          <input
            type="datetime-local"
            value={deadlineForm.dueAt}
            onChange={(event) =>
              setDeadlineForm((current) => ({ ...current, dueAt: event.target.value }))
            }
            className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
            required
          />
        </label>
        <select
          value={deadlineForm.severity}
          onChange={(event) =>
            setDeadlineForm((current) => ({ ...current, severity: event.target.value }))
          }
          className="border border-slate-300 px-2 py-2 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button title="Add deadline" className="bg-slate-900 p-2 text-white">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <div className="space-y-2">
        {deadlines.map((deadline) => (
          <div key={deadline.id} className="flex items-center gap-3 border border-slate-200 p-3">
            <CalendarClock className="h-4 w-4 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{deadline.title}</p>
              <p className="text-xs text-slate-500">
                {formatDateTime(deadline.due_at)} · {deadline.severity}
              </p>
            </div>
            {deadline.status === 'open' && (
              <button
                onClick={() => void onMarkDeadlineMet(deadline.id)}
                className="border border-slate-300 px-2 py-1 text-xs font-black"
              >
                Met
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
