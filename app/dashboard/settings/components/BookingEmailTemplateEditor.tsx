'use client'

import { useId, useRef } from 'react'

import {
  ALLOWED_TEMPLATE_VARIABLES,
  type BookingTemplateValues,
  buildBookingEmailHtmlFromTemplate,
} from '@/lib/bookingEmailTemplate'

export type BookingTemplateField =
  | 'confirmation_template'
  | 'modification_template'
  | 'cancellation_template'

type TemplatePreset = { label: string; template: string }

const TEMPLATE_VARIABLES = [...ALLOWED_TEMPLATE_VARIABLES]

const BOOKING_TEMPLATE_PRESETS: Record<BookingTemplateField, TemplatePreset[]> = {
  confirmation_template: [
    {
      label: 'Formal',
      template:
        'Dear [Customer Name],\n\nYour appointment for [service booked] has been confirmed for [date booked] at [time booked] at [branch name].\n\nPlease arrive 10 minutes early and bring any required documents.\n\nKind regards,\nPiyam Travel',
    },
    {
      label: 'Friendly',
      template:
        'Hi [Customer Name],\n\nYou are booked in for [service booked] on [date booked] at [time booked] with [branch name].\n\nIf you need to change anything, just let us know.\n\nThanks,\nPiyam Travel',
    },
    {
      label: 'Short',
      template:
        'Booking confirmed: [service booked] on [date booked] at [time booked] - [branch name].',
    },
  ],
  modification_template: [
    {
      label: 'Formal',
      template:
        'Dear [Customer Name],\n\nYour appointment for [service booked] has been updated. The new time is [date booked] at [time booked] at [branch name].\n\nPlease contact us if this change does not suit you.\n\nKind regards,\nPiyam Travel',
    },
    {
      label: 'Friendly',
      template:
        'Hi [Customer Name],\n\nWe have updated your [service booked] appointment to [date booked] at [time booked] with [branch name].\n\nReply if you need anything else.\n\nThanks,\nPiyam Travel',
    },
    {
      label: 'Short',
      template:
        'Appointment updated: [service booked] is now on [date booked] at [time booked] - [branch name].',
    },
  ],
  cancellation_template: [
    {
      label: 'Formal',
      template:
        'Dear [Customer Name],\n\nYour appointment for [service booked] on [date booked] at [time booked] at [branch name] has been cancelled.\n\nIf you would like to rebook, please contact us and we will be happy to help.\n\nKind regards,\nPiyam Travel',
    },
    {
      label: 'Friendly',
      template:
        'Hi [Customer Name],\n\nYour [service booked] booking for [date booked] at [time booked] with [branch name] has been cancelled.\n\nIf you want a new slot, let us know.\n\nThanks,\nPiyam Travel',
    },
    {
      label: 'Short',
      template:
        'Appointment cancelled: [service booked] on [date booked] at [time booked] - [branch name].',
    },
  ],
}

export const BOOKING_TEMPLATE_DEFAULTS: Record<BookingTemplateField, string> = {
  confirmation_template: BOOKING_TEMPLATE_PRESETS.confirmation_template[0].template,
  modification_template: BOOKING_TEMPLATE_PRESETS.modification_template[0].template,
  cancellation_template: BOOKING_TEMPLATE_PRESETS.cancellation_template[0].template,
}

export const REMINDER_TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    label: 'Formal',
    template:
      'Dear [Customer Name],\n\nThis is a reminder that your [service booked] appointment is scheduled for [date booked] at [time booked] at [branch name].\n\nIf you cannot attend, please contact us as soon as possible.\n\nKind regards,\nPiyam Travel',
  },
  {
    label: 'Friendly',
    template:
      'Hi [Customer Name],\n\nJust a quick reminder about your [service booked] appointment on [date booked] at [time booked] with [branch name].\n\nIf anything has changed, please let us know as soon as you can.\n\nThanks,\nPiyam Travel',
  },
  {
    label: 'Short',
    template:
      'Reminder: your [service booked] appointment is on [date booked] at [time booked] at [branch name]. Please contact us if you cannot attend.',
  },
]

const TEMPLATE_SAMPLE_VALUES: BookingTemplateValues = {
  'Customer Name': 'Alex Carter',
  'date booked': '24 Apr 2026',
  'time booked': '10:30',
  'service booked': 'Visa Consultation',
  'branch name': 'London Branch',
  'branch address': '12 Station Road, London, SW1A 1AA, United Kingdom',
  'branch contact number': '+44 2071234567',
}

function buildTemplatePreviewHtml(rawTemplate: string | null | undefined): string {
  const template = rawTemplate?.trim() || 'Start typing a template to preview it here.'
  return buildBookingEmailHtmlFromTemplate(template, TEMPLATE_SAMPLE_VALUES)
}

export function BookingTemplatePreview({
  title,
  template,
}: {
  title: string
  template: string | null | undefined
}) {
  return (
    <div className="mt-2 rounded border border-slate-200 bg-white p-2">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title} Preview
      </p>
      <iframe
        title={`${title} preview`}
        srcDoc={buildTemplatePreviewHtml(template)}
        className="h-56 w-full rounded border border-slate-200"
        sandbox=""
      />
    </div>
  )
}

interface BookingEmailTemplateEditorProps {
  field: BookingTemplateField
  label: string
  previewTitle: string
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
}

export function BookingEmailTemplateEditor({
  field,
  label,
  previewTitle,
  value,
  onChange,
  placeholder,
}: BookingEmailTemplateEditorProps) {
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const currentValue = value || ''

  const insertToken = (token: string) => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? currentValue.length
    const end = textarea?.selectionEnd ?? currentValue.length
    const nextValue = textarea
      ? `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`
      : `${currentValue}${currentValue.endsWith(' ') || !currentValue ? '' : ' '}${token}`
    onChange(nextValue)
    requestAnimationFrame(() => {
      const nextCursor = start + token.length
      textarea?.focus()
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <div className="block space-y-1">
      <label htmlFor={textareaId} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <span className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Presets
        </span>
        {BOOKING_TEMPLATE_PRESETS[field].map((preset) => (
          <button
            key={`${field}-${preset.label}`}
            type="button"
            onClick={() => onChange(preset.template)}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
        >
          Clear
        </button>
      </span>
      <span className="mb-2 flex flex-wrap gap-1.5">
        {TEMPLATE_VARIABLES.map((token) => (
          <button
            key={`${field}-${token}`}
            type="button"
            onClick={() => insertToken(token)}
            className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
          >
            {token}
          </button>
        ))}
      </span>
      <textarea
        id={textareaId}
        ref={textareaRef}
        aria-label={label}
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      <BookingTemplatePreview title={previewTitle} template={value} />
    </div>
  )
}
