'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { ALLOWED_TEMPLATE_VARIABLES } from '@/lib/bookingEmailTemplate'
import { defaultReminderSettings, type BookingReminderSettings } from '@/lib/bookingReminders'
import { BookingTemplatePreview, REMINDER_TEMPLATE_PRESETS } from './BookingEmailTemplateEditor'

const TEMPLATE_VARIABLES = [...ALLOWED_TEMPLATE_VARIABLES]

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function insertTokenAtSelection(
  currentValue: string,
  token: string,
  textarea: HTMLTextAreaElement | null,
): string {
  if (!textarea) {
    return `${currentValue}${currentValue.endsWith(' ') || currentValue.length === 0 ? '' : ' '}${token}`
  }
  const start = textarea.selectionStart ?? currentValue.length
  const end = textarea.selectionEnd ?? currentValue.length
  return `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`
}

export function BookingReminderSettingsPanel({
  selectedLocationId,
  onEditServiceEmails,
}: {
  selectedLocationId: string
  onEditServiceEmails: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [reminderSettings, setReminderSettings] = useState<BookingReminderSettings>(() =>
    defaultReminderSettings(selectedLocationId),
  )
  const reminderTemplateRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let active = true
    setReminderSettings(defaultReminderSettings(selectedLocationId))
    setLoading(true)

    void (async () => {
      try {
        const response = await fetch(
          `/api/bookings/settings/reminders?location_id=${selectedLocationId}`,
        )
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Failed to load reminder settings')
        if (active) {
          setReminderSettings(
            (json.settings ||
              defaultReminderSettings(selectedLocationId)) as BookingReminderSettings,
          )
        }
      } catch (error) {
        if (active) {
          toast.error('Failed to load reminder settings', {
            description: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [selectedLocationId])

  const insertReminderTemplateToken = (token: string) => {
    const textarea = reminderTemplateRef.current
    const cursorStart = textarea?.selectionStart ?? textarea?.value.length ?? 0
    setReminderSettings((current) => ({
      ...current,
      reminder_template: insertTokenAtSelection(current.reminder_template, token, textarea),
    }))
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursorStart + token.length, cursorStart + token.length)
    })
  }

  const saveReminders = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/bookings/settings/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: selectedLocationId,
          settings: reminderSettings,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to save reminder settings')
      setReminderSettings((json.settings || reminderSettings) as BookingReminderSettings)
      toast.success('Reminder and penalty settings saved')
    } catch (error) {
      toast.error('Failed to save reminder settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[#e7cbd0] bg-[#fffafa]">
        <div className="border-b border-[#ecd6da] bg-white px-5 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b1d2c]">
                Customer communications
              </p>
              <h3 className="mt-1 text-xl font-bold tracking-tight text-[#521723]">
                Messages & attendance, all in one place
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69434b]">
                Set the reminder customers receive, let them respond to their appointment, and
                choose how repeat missed appointments should be handled. Service-specific
                confirmation, change and cancellation emails stay available alongside each service.
              </p>
            </div>
            <button
              type="button"
              onClick={onEditServiceEmails}
              className="shrink-0 rounded-lg border border-[#d8aeb5] bg-white px-3 py-2 text-sm font-semibold text-[#7b1d2b] transition hover:bg-[#fff3f4]"
            >
              Edit service emails
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-[#ecd6da] sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[#fffafa] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5360]">
              Booking emails
            </p>
            <p className="mt-2 text-sm font-semibold text-[#4d1a25]">
              Confirmations, changes & cancellations
            </p>
            <p className="mt-1 text-xs leading-5 text-[#76505a]">
              Written per service, so the customer receives the right message for their appointment.
            </p>
          </div>
          <div className="bg-[#fffafa] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5360]">
              Reminder delivery
            </p>
            <p className="mt-2 text-sm font-semibold text-[#4d1a25]">
              {reminderSettings.reminders_enabled
                ? 'Automatic reminders are on'
                : 'Reminders are paused'}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#76505a]">
              Main reminder {reminderSettings.reminder_hours_before} hours before
              {reminderSettings.same_day_reminder_enabled
                ? `, plus ${reminderSettings.same_day_reminder_hours_before} hours before.`
                : '.'}
            </p>
          </div>
          <div className="bg-[#fffafa] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5360]">
              Customer response
            </p>
            <p className="mt-2 text-sm font-semibold text-[#4d1a25]">
              {reminderSettings.attendance_confirmation_required
                ? 'Present / unable-to-attend links included'
                : 'Attendance links are off'}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#76505a]">
              Responses update the appointment record without giving the customer staff access.
            </p>
          </div>
          <div className="bg-[#fffafa] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5360]">
              Customer portal
            </p>
            <p className="mt-2 text-sm font-semibold text-[#4d1a25]">Visit code stays protected</p>
            <p className="mt-1 text-xs leading-5 text-[#76505a]">
              Booking confirmations append the customer&apos;s portal access details separately, so
              a template edit cannot remove them.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b1d2c]">
              Reminder schedule
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">When customers hear from you</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Set both reminder windows independently. The second one is useful for customers who
              book several days ahead, without sending duplicate messages.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-[#e4c7cc] bg-[#fff7f8] px-3 py-2 text-sm font-semibold text-[#6d1827]">
            <input
              type="checkbox"
              checked={reminderSettings.reminders_enabled}
              onChange={(e) =>
                setReminderSettings((p) => ({ ...p, reminders_enabled: e.target.checked }))
              }
              className="accent-[#8b1d2c]"
            />
            Send reminders automatically
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff0f2] text-xs font-bold text-[#8b1d2c]">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Main reminder</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Sent before every eligible appointment when reminders are enabled.
                </p>
                <LabeledInput label="Hours before appointment">
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={reminderSettings.reminder_hours_before}
                    onChange={(e) =>
                      setReminderSettings((p) => ({
                        ...p,
                        reminder_hours_before: Math.min(
                          168,
                          Math.max(1, Number(e.target.value) || 24),
                        ),
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
                  />
                </LabeledInput>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff0f2] text-xs font-bold text-[#8b1d2c]">
                2
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Same-day reminder</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      A concise final prompt before the appointment.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={reminderSettings.same_day_reminder_enabled}
                      onChange={(e) =>
                        setReminderSettings((p) => ({
                          ...p,
                          same_day_reminder_enabled: e.target.checked,
                        }))
                      }
                      className="accent-[#8b1d2c]"
                    />
                    Send it
                  </label>
                </div>
                <LabeledInput label="Hours before appointment">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    disabled={!reminderSettings.same_day_reminder_enabled}
                    value={reminderSettings.same_day_reminder_hours_before}
                    onChange={(e) =>
                      setReminderSettings((p) => ({
                        ...p,
                        same_day_reminder_hours_before: Math.min(
                          12,
                          Math.max(1, Number(e.target.value) || 2),
                        ),
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </LabeledInput>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b1d2c]">
            Reminder message
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            Write it, then see exactly what they see
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Your subject and message use the same approved placeholders as service emails. The
            attendance response links are safely added after this message when enabled.
          </p>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.85fr)]">
          <div className="space-y-4">
            <LabeledInput label="Email subject">
              <input
                type="text"
                value={reminderSettings.reminder_subject}
                onChange={(e) =>
                  setReminderSettings((p) => ({ ...p, reminder_subject: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
              />
            </LabeledInput>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Message style
                </span>
                {REMINDER_TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setReminderSettings((p) => ({ ...p, reminder_template: preset.template }))
                    }
                    className="rounded-md border border-[#dfbdc3] bg-[#fff7f8] px-2 py-1 text-xs font-semibold text-[#7b1d2b] transition hover:bg-[#ffecee]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <LabeledInput label="Reminder email message">
                <textarea
                  ref={reminderTemplateRef}
                  rows={10}
                  value={reminderSettings.reminder_template}
                  onChange={(e) =>
                    setReminderSettings((p) => ({ ...p, reminder_template: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
                />
              </LabeledInput>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Insert detail
                </span>
                {TEMPLATE_VARIABLES.map((token) => (
                  <button
                    key={`reminder-${token}`}
                    type="button"
                    onClick={() => insertReminderTemplateToken(token)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-[#dfbdc3] hover:bg-[#fff7f8] hover:text-[#7b1d2b]"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#ead2d6] bg-[#fffafa] p-3">
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <div>
                <p className="text-sm font-semibold text-[#521723]">Live email preview</p>
                <p className="mt-0.5 text-xs text-[#78525b]">
                  White logo header and maroon-tinted body.
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#8b1d2c] shadow-sm">
                Sample customer
              </span>
            </div>
            <BookingTemplatePreview
              title="Reminder email"
              template={reminderSettings.reminder_template}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e7cbd0] bg-[#fffafa] p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b1d2c]">
              Attendance response
            </p>
            <h3 className="mt-1 text-lg font-bold text-[#521723]">Make the reminder actionable</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69434b]">
              Add an appointment-specific response link to the reminder. Choosing Present marks the
              booking as present; choosing Unable to attend marks it missed and feeds the repeat
              no-show record. The customer only receives this response link, never staff portal
              access.
            </p>
            <label className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#ddb9c0] bg-white px-3 py-2 text-sm font-semibold text-[#6d1827]">
              <input
                type="checkbox"
                checked={reminderSettings.attendance_confirmation_required}
                onChange={(e) =>
                  setReminderSettings((p) => ({
                    ...p,
                    attendance_confirmation_required: e.target.checked,
                  }))
                }
                className="accent-[#8b1d2c]"
              />
              Include attendance response links
            </label>
          </div>
          <div className="rounded-xl border border-[#dfbdc3] bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5360]">
              Customer sees
            </p>
            <div className="mt-3 space-y-2">
              <div className="rounded-lg bg-[#eef8f1] px-3 py-2 text-sm font-semibold text-[#20633a]">
                I&apos;ll be there
              </div>
              <div className="rounded-lg bg-[#fff1f1] px-3 py-2 text-sm font-semibold text-[#8b1d2c]">
                I can&apos;t attend
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#76505a]">
              Each response is tied to the reminder, so it updates the right appointment.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
            Repeat missed appointments
          </p>
          <h3 className="mt-1 text-lg font-bold text-amber-950">Keep the policy clear for staff</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
            Missed appointments are matched by phone or email, not name, to avoid common-name false
            matches. You can keep this as a staff warning or require a staff review before another
            booking.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-slate-700">
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={reminderSettings.penalty_enabled}
                onChange={(e) =>
                  setReminderSettings((p) => ({ ...p, penalty_enabled: e.target.checked }))
                }
                className="accent-[#8b1d2c]"
              />
              Track repeat missed appointments
            </span>
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              Turn this off to keep attendance history without triggering the selected policy.
            </span>
          </label>

          <LabeledInput label="Missed appointments before policy applies">
            <input
              type="number"
              min={1}
              max={20}
              value={reminderSettings.penalty_threshold}
              onChange={(e) =>
                setReminderSettings((p) => ({
                  ...p,
                  penalty_threshold: Math.min(20, Math.max(1, Number(e.target.value) || 3)),
                }))
              }
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
            />
          </LabeledInput>

          <LabeledInput label="When the threshold is reached">
            <select
              value={reminderSettings.penalty_action}
              onChange={(e) =>
                setReminderSettings((p) => ({
                  ...p,
                  penalty_action: e.target.value as 'warn_only' | 'block_until_manual_review',
                }))
              }
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
            >
              <option value="warn_only">Warn staff, but allow the booking</option>
              <option value="block_until_manual_review">Ask staff for manual review</option>
            </select>
          </LabeledInput>

          <LabeledInput label="Staff note (optional)">
            <input
              type="text"
              value={reminderSettings.penalty_note || ''}
              onChange={(e) =>
                setReminderSettings((p) => ({ ...p, penalty_note: e.target.value || null }))
              }
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#8b1d2c] focus:outline-none focus:ring-2 focus:ring-[#f4d8dc]"
              placeholder="Shown to staff when a booking needs review"
            />
          </LabeledInput>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-xs text-slate-500">
          Changes apply to future booking messages and attendance responses for this branch.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setReminderSettings(defaultReminderSettings(selectedLocationId))}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={saveReminders}
            disabled={loading}
            className="rounded-lg bg-[#7b1d2b] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#651522] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save messages & attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}
