'use client'

import type { BookingDraftPayload } from '@/app/types/bookings'
import {
  COUNTRY_CODE_OPTIONS,
  type BookingServiceOption,
} from '@/app/dashboard/bookings/bookingClientModel'
import { PencilIcon } from '@/app/dashboard/bookings/BookingIcons'

type NotesAutosaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function BookingAppointmentDetailsFields({
  appointmentForm,
  showRescheduleOnly,
  isEditing,
  todayDateKey,
  serviceOptions,
  invalidLocalPhone,
  manualOverrideWarning,
  showNotesEditor,
  notesAutosaveState,
  onFieldChange,
  onServiceChange,
  onDateChange,
  onManualOverrideChange,
  onToggleNotes,
}: {
  appointmentForm: BookingDraftPayload
  showRescheduleOnly: boolean
  isEditing: boolean
  todayDateKey: string
  serviceOptions: BookingServiceOption[]
  invalidLocalPhone: boolean
  manualOverrideWarning: string | null
  showNotesEditor: boolean
  notesAutosaveState: NotesAutosaveState
  onFieldChange: (changes: Partial<BookingDraftPayload>) => void
  onServiceChange: (serviceId: string) => void
  onDateChange: (date: string) => void
  onManualOverrideChange: (enabled: boolean) => void
  onToggleNotes: () => void
}) {
  return (
    <>
      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700">
          Name
          <input
            value={appointmentForm.customer_name}
            onChange={(event) => onFieldChange({ customer_name: event.target.value })}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
      )}

      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700">
          Email address
          <input
            type="email"
            value={appointmentForm.customer_email}
            onChange={(event) => onFieldChange({ customer_email: event.target.value })}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
      )}

      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700">
          Country code
          <select
            value={appointmentForm.phone_country_code}
            onChange={(event) => onFieldChange({ phone_country_code: event.target.value })}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          >
            {COUNTRY_CODE_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700">
          Phone number
          <input
            value={appointmentForm.phone_local}
            onChange={(event) => onFieldChange({ phone_local: event.target.value })}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
          {invalidLocalPhone && (
            <p className="mt-1 text-xs text-red-600">
              Enter 6-14 digits (spaces and dashes are allowed).
            </p>
          )}
        </label>
      )}

      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700">
          Service
          <select
            value={appointmentForm.service_id}
            onChange={(event) => onServiceChange(event.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          >
            <option value="">Select service</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="text-sm text-slate-700">
        Date
        <input
          type="date"
          min={isEditing ? undefined : todayDateKey}
          value={appointmentForm.date}
          onChange={(event) => onDateChange(event.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
        />
      </label>

      {!showRescheduleOnly && (
        <label className="text-sm text-slate-700 md:col-span-2">
          Tags
          <input
            value={appointmentForm.tags}
            onChange={(event) => onFieldChange({ tags: event.target.value })}
            placeholder="vip, follow-up, awaiting-docs"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-400">Comma-separated internal tags.</p>
        </label>
      )}

      {!isEditing && !showRescheduleOnly && (
        <label className="text-sm text-slate-700 md:col-span-2">
          <span className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={appointmentForm.manual_override}
              onChange={(event) => onManualOverrideChange(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Manual override (set custom start and end time)
          </span>
        </label>
      )}

      {appointmentForm.manual_override && (
        <>
          <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Manual override uses your local browser time zone. Set the exact start and end time you
            want saved.
          </div>

          <label className="text-sm text-slate-700">
            Start time
            <input
              type="time"
              value={appointmentForm.start_time}
              onChange={(event) => onFieldChange({ start_time: event.target.value })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            End time
            <input
              type="time"
              value={appointmentForm.end_time}
              onChange={(event) => onFieldChange({ end_time: event.target.value })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
            />
            {manualOverrideWarning && (
              <p className="mt-1 text-xs font-medium text-amber-700">{manualOverrideWarning}</p>
            )}
          </label>
        </>
      )}

      {!showRescheduleOnly && (
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={onToggleNotes}
            className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <PencilIcon className="h-4 w-4" />
            {showNotesEditor
              ? 'Hide notes'
              : appointmentForm.notes.trim()
                ? 'Show notes'
                : 'Add notes'}
          </button>
          {showNotesEditor && (
            <label className="mt-2 block text-sm text-slate-700">
              Notes
              <textarea
                value={appointmentForm.notes}
                onChange={(event) => onFieldChange({ notes: event.target.value })}
                rows={3}
                placeholder="Optional internal note for this appointment"
                className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
              />
              {isEditing && (
                <p className="mt-1 text-xs text-slate-500">
                  Notes autosave while you type.
                  {notesAutosaveState === 'saving' && ' Saving...'}
                  {notesAutosaveState === 'saved' && ' Saved'}
                  {notesAutosaveState === 'error' && ' Save failed. Please click Save Changes.'}
                </p>
              )}
            </label>
          )}
        </div>
      )}
    </>
  )
}
