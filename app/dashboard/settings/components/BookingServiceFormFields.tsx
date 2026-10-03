import type { ReactNode } from 'react'

import { BOOKING_TEMPLATE_DEFAULTS, BookingEmailTemplateEditor } from './BookingEmailTemplateEditor'
import { BOOKING_DAY_NAMES } from './BookingScheduleSettings'

export interface BookingServiceFormValue {
  name: string
  duration_minutes: number
  buffer_minutes: number
  available_days: number[] | null
  service_start_time: string | null
  service_end_time: string | null
  confirmation_template: string | null
  modification_template: string | null
  cancellation_template: string | null
  duration_per_additional_person_minutes: number
  person_count_excludes_family_head: boolean
  close_overrun_tolerance_minutes: number
  customer_visible: boolean
  customer_description: string | null
  customer_max_group_size: number
  customer_modification_cutoff_hours: number
}

export function buildDefaultBookingServiceForm(): BookingServiceFormValue {
  return {
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: [],
    confirmation_template: BOOKING_TEMPLATE_DEFAULTS.confirmation_template,
    modification_template: BOOKING_TEMPLATE_DEFAULTS.modification_template,
    cancellation_template: BOOKING_TEMPLATE_DEFAULTS.cancellation_template,
    service_start_time: '',
    service_end_time: '',
    duration_per_additional_person_minutes: 0,
    person_count_excludes_family_head: true,
    close_overrun_tolerance_minutes: 15,
    customer_visible: false,
    customer_description: '',
    customer_max_group_size: 20,
    customer_modification_cutoff_hours: 24,
  }
}

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function toggleServiceDay(days: number[] | null, day: number): number[] {
  const current = Array.isArray(days) ? days : []
  if (current.includes(day)) return current.filter((candidate) => candidate !== day)
  return [...current, day].sort((left, right) => left - right)
}

export function BookingServiceFormFields({
  value,
  onChange,
}: {
  value: BookingServiceFormValue
  onChange: (value: BookingServiceFormValue) => void
}) {
  const update = <Key extends keyof BookingServiceFormValue>(
    field: Key,
    nextValue: BookingServiceFormValue[Key],
  ) => onChange({ ...value, [field]: nextValue })

  return (
    <>
      <LabeledInput label="Service Name">
        <input
          type="text"
          value={value.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="e.g. Medical"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </LabeledInput>
      <LabeledInput label="Duration (minutes)">
        <input
          type="number"
          min={5}
          value={value.duration_minutes}
          onChange={(event) => update('duration_minutes', Number(event.target.value))}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </LabeledInput>
      <LabeledInput label="Buffer (minutes)">
        <input
          type="number"
          min={0}
          value={value.buffer_minutes}
          onChange={(event) => update('buffer_minutes', Number(event.target.value))}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </LabeledInput>
      <LabeledInput label="Service Start Time">
        <input
          type="time"
          value={value.service_start_time || ''}
          onChange={(event) => update('service_start_time', event.target.value || null)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </LabeledInput>
      <LabeledInput label="Service End Time">
        <input
          type="time"
          value={value.service_end_time || ''}
          onChange={(event) => update('service_end_time', event.target.value || null)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </LabeledInput>
      <LabeledInput label="Extra Time per Additional Person (minutes)">
        <input
          type="number"
          min={0}
          value={value.duration_per_additional_person_minutes}
          onChange={(event) =>
            update(
              'duration_per_additional_person_minutes',
              Math.max(0, Number(event.target.value)),
            )
          }
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-slate-400">e.g. 22 mins → 3 people ≈ 2.5 slots</p>
      </LabeledInput>
      <LabeledInput label="Close-Time Overrun Allowed (minutes)">
        <input
          type="number"
          min={0}
          value={value.close_overrun_tolerance_minutes}
          onChange={(event) =>
            update('close_overrun_tolerance_minutes', Math.max(0, Number(event.target.value)))
          }
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Allows an appointment to finish this many minutes after service close time.
        </p>
      </LabeledInput>
      <LabeledInput label="Person Count Rule">
        <span className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.person_count_excludes_family_head}
            onChange={(event) => update('person_count_excludes_family_head', event.target.checked)}
          />
          Person count excludes family head
        </span>
      </LabeledInput>
      <div className="rounded border border-slate-200 bg-white px-3 py-2 md:col-span-3">
        <p className="mb-2 text-xs font-medium text-slate-500">Available days</p>
        <div className="flex flex-wrap gap-2">
          {BOOKING_DAY_NAMES.map((name, day) => {
            const active = Array.isArray(value.available_days) && value.available_days.includes(day)
            return (
              <button
                key={name}
                type="button"
                onClick={() =>
                  update('available_days', toggleServiceDay(value.available_days, day))
                }
                className={`rounded border px-2 py-1 text-xs ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {name.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 md:col-span-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-950">Customer portal listing</p>
            <p className="mt-1 text-xs leading-5 text-indigo-800">
              Keep this off for internal-only services. Turn it on only when customers can select
              this service in the customer portal. Confirmation emails provide the private VISIT
              code used to claim a staff-created appointment.
            </p>
          </div>
          <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-800">
            <input
              type="checkbox"
              checked={value.customer_visible}
              onChange={(event) => update('customer_visible', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            Offer in customer portal
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_190px]">
          <LabeledInput label="Customer-facing description (optional)">
            <textarea
              rows={2}
              maxLength={1000}
              value={value.customer_description || ''}
              onChange={(event) => update('customer_description', event.target.value || null)}
              placeholder="Tell customers what this appointment is for and what to bring."
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
            />
          </LabeledInput>
          <LabeledInput label="Maximum group size">
            <input
              type="number"
              min={1}
              max={100}
              value={value.customer_max_group_size}
              onChange={(event) =>
                update(
                  'customer_max_group_size',
                  Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                )
              }
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
            />
          </LabeledInput>
          <LabeledInput label="Change/cancel cutoff (hours)">
            <input
              type="number"
              min={0}
              max={168}
              value={value.customer_modification_cutoff_hours}
              onChange={(event) =>
                update(
                  'customer_modification_cutoff_hours',
                  Math.min(168, Math.max(0, Number(event.target.value) || 0)),
                )
              }
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
            />
          </LabeledInput>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:col-span-5 md:grid-cols-3">
        <BookingEmailTemplateEditor
          field="confirmation_template"
          label="Booking Confirmation Email Template"
          previewTitle="Confirmation"
          value={value.confirmation_template}
          onChange={(nextValue) => update('confirmation_template', nextValue || null)}
          placeholder="Dear [Customer Name],\n\nYour appointment has been booked for [date booked] at [time booked] for [service booked]."
        />
        <BookingEmailTemplateEditor
          field="modification_template"
          label="Booking Modification Email Template"
          previewTitle="Modification"
          value={value.modification_template}
          onChange={(nextValue) => update('modification_template', nextValue || null)}
          placeholder="Dear [Customer Name],\n\nYour appointment has been updated to [date booked] at [time booked] for [service booked]."
        />
        <BookingEmailTemplateEditor
          field="cancellation_template"
          label="Booking Cancellation Email Template"
          previewTitle="Cancellation"
          value={value.cancellation_template}
          onChange={(nextValue) => update('cancellation_template', nextValue || null)}
          placeholder="Dear [Customer Name],\n\nYour appointment for [service booked] on [date booked] at [time booked] has been cancelled."
        />
      </div>
    </>
  )
}
