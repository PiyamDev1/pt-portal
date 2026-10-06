'use client'

import type { Dispatch, SetStateAction } from 'react'
import type {
  TravelPackageCommunication,
  TravelPackageCommunicationChannel,
  TravelPackageCommunicationDirection,
} from '@/app/types/packages'
import { formatDateTime, label } from './packageOperationsModel'

export type PackageCommunicationForm = {
  summary: string
  channel: TravelPackageCommunicationChannel
  direction: TravelPackageCommunicationDirection
  followUpRequired: boolean
  followUpDueAt: string
}

type PackageCommunicationPanelProps = {
  communications: TravelPackageCommunication[]
  communicationForm: PackageCommunicationForm
  setCommunicationForm: Dispatch<SetStateAction<PackageCommunicationForm>>
  onLogCommunication: (body: Record<string, unknown>) => void | Promise<void>
}

export function PackageCommunicationPanel({
  communications,
  communicationForm,
  setCommunicationForm,
  onLogCommunication,
}: PackageCommunicationPanelProps) {
  return (
    <div className="space-y-4 xl:col-span-2">
      <h3 className="text-sm font-black">Communication log</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onLogCommunication(communicationForm)
        }}
        className="grid gap-2 border border-slate-200 bg-slate-50 p-3 md:grid-cols-[9rem_9rem_1fr_auto]"
      >
        <select
          value={communicationForm.channel}
          onChange={(event) =>
            setCommunicationForm((current) => ({
              ...current,
              channel: event.target.value as TravelPackageCommunicationChannel,
            }))
          }
          className="border border-slate-300 px-2 py-2 text-xs"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Phone</option>
          <option value="in_person">In person</option>
          <option value="email">Email</option>
          <option value="internal">Internal</option>
        </select>
        <select
          value={communicationForm.direction}
          onChange={(event) =>
            setCommunicationForm((current) => ({
              ...current,
              direction: event.target.value as TravelPackageCommunicationDirection,
            }))
          }
          className="border border-slate-300 px-2 py-2 text-xs"
        >
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
          <option value="internal">Internal</option>
        </select>
        <input
          placeholder="What happened?"
          value={communicationForm.summary}
          onChange={(event) =>
            setCommunicationForm((current) => ({ ...current, summary: event.target.value }))
          }
          className="border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <button className="bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white">Log</button>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 md:col-span-2">
          <input
            type="checkbox"
            checked={communicationForm.followUpRequired}
            onChange={(event) =>
              setCommunicationForm((current) => ({
                ...current,
                followUpRequired: event.target.checked,
              }))
            }
          />
          Follow-up required
        </label>
        {communicationForm.followUpRequired && (
          <label className="text-[11px] font-bold uppercase text-slate-500">
            Follow-up due date
            <input
              type="datetime-local"
              value={communicationForm.followUpDueAt}
              onChange={(event) =>
                setCommunicationForm((current) => ({
                  ...current,
                  followUpDueAt: event.target.value,
                }))
              }
              className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
            />
          </label>
        )}
      </form>
      <div className="space-y-2">
        {communications.map((entry) => (
          <div key={entry.id} className="border-l-2 border-[#8b1e2d] bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-800">{entry.summary}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {label(entry.channel)} · {label(entry.direction)} · {formatDateTime(entry.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
