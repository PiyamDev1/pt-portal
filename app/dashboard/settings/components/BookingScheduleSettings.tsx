'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

export const BOOKING_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const INTERVAL_OPTIONS = [15, 20, 30, 45, 60]

export interface BranchSettingRow {
  id: string
  location_id: string
  day_of_week: number
  open_time: string
  close_time: string
  lunch_start_time: string | null
  lunch_end_time: string | null
  prayer_start_time: string | null
  prayer_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
}

export interface BranchScheduleOverride {
  id: string
  location_id: string
  date: string
  open_time: string | null
  close_time: string | null
  lunch_start_time: string | null
  lunch_end_time: string | null
  prayer_start_time: string | null
  prayer_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
  notes: string | null
}

export type BranchScheduleOverrideDraft = Omit<
  BranchScheduleOverride,
  'id' | 'location_id' | 'date'
>

export function buildDefaultBookingWeek(locationId: string): BranchSettingRow[] {
  return BOOKING_DAY_NAMES.map((_, day) => ({
    id: `temp-${day}`,
    location_id: locationId,
    day_of_week: day,
    open_time: '09:00',
    close_time: '17:00',
    lunch_start_time: '13:00',
    lunch_end_time: '14:00',
    prayer_start_time: day === 5 ? '13:00' : null,
    prayer_end_time: day === 5 ? '14:00' : null,
    is_closed: day === 0,
    concurrent_staff: 1,
    slot_interval_minutes: 30,
  }))
}

export function buildDefaultScheduleOverride(): BranchScheduleOverrideDraft {
  return {
    open_time: '09:00',
    close_time: '17:00',
    lunch_start_time: '13:00',
    lunch_end_time: '14:00',
    prayer_start_time: null,
    prayer_end_time: null,
    is_closed: false,
    concurrent_staff: 1,
    slot_interval_minutes: 30,
    notes: null,
  }
}

export interface BookingScheduleSettingsModel {
  weeklySettings: BranchSettingRow[]
  overrides: BranchScheduleOverride[]
  newOverrideDate: string
  newOverride: BranchScheduleOverrideDraft
  loading: boolean
  updateDay: (
    day: number,
    field: keyof BranchSettingRow,
    value: string | number | boolean | null,
  ) => void
  setNewOverrideDate: (date: string) => void
  updateOverride: <Field extends keyof BranchScheduleOverrideDraft>(
    field: Field,
    value: BranchScheduleOverrideDraft[Field],
  ) => void
  saveWeekly: () => Promise<void>
  saveOverride: () => Promise<void>
  deleteOverride: (id: string) => Promise<void>
}

export function useBookingScheduleSettings(
  locationId: string | null,
): BookingScheduleSettingsModel {
  const [weeklySettings, setWeeklySettings] = useState<BranchSettingRow[]>([])
  const [overrides, setOverrides] = useState<BranchScheduleOverride[]>([])
  const [newOverrideDate, setNewOverrideDate] = useState('')
  const [newOverride, setNewOverride] = useState<BranchScheduleOverrideDraft>(
    buildDefaultScheduleOverride,
  )
  const [loading, setLoading] = useState(false)
  const loadSequence = useRef(0)

  const loadSchedule = useCallback(async (nextLocationId: string) => {
    const sequence = ++loadSequence.current
    setLoading(true)
    try {
      const from = new Date()
      const to = new Date(from)
      to.setUTCDate(to.getUTCDate() + 60)

      const [weeklyRes, overridesRes] = await Promise.all([
        fetch(`/api/bookings/settings/branch?location_id=${nextLocationId}`),
        fetch(
          `/api/bookings/settings/overrides?location_id=${nextLocationId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`,
        ),
      ])
      const weeklyJson = await weeklyRes.json()
      const overridesJson = await overridesRes.json()

      if (!weeklyRes.ok) throw new Error(weeklyJson.error || 'Failed to load weekly settings')
      if (!overridesRes.ok) throw new Error(overridesJson.error || 'Failed to load special dates')
      if (sequence !== loadSequence.current) return

      const rows = (weeklyJson.settings || []) as BranchSettingRow[]
      setWeeklySettings(rows.length > 0 ? rows : buildDefaultBookingWeek(nextLocationId))
      setOverrides((overridesJson.overrides || []) as BranchScheduleOverride[])
    } catch (error) {
      if (sequence !== loadSequence.current) return
      setWeeklySettings(buildDefaultBookingWeek(nextLocationId))
      setOverrides([])
      toast.error('Failed to load booking schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (locationId) {
      void loadSchedule(locationId)
      return
    }

    loadSequence.current += 1
    setWeeklySettings([])
    setOverrides([])
    setLoading(false)
  }, [loadSchedule, locationId])

  const updateDay: BookingScheduleSettingsModel['updateDay'] = (day, field, value) => {
    setWeeklySettings((current) =>
      current.map((row) => (row.day_of_week === day ? { ...row, [field]: value } : row)),
    )
  }

  const updateOverride: BookingScheduleSettingsModel['updateOverride'] = (field, value) => {
    setNewOverride((current) => ({ ...current, [field]: value }))
  }

  const saveWeekly = async () => {
    if (!locationId) return
    setLoading(true)
    try {
      const response = await fetch('/api/bookings/settings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId, settings: weeklySettings }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to save weekly settings')
      toast.success('Weekly appointment hours saved')
      await loadSchedule(locationId)
    } catch (error) {
      toast.error('Failed to save weekly appointment hours', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setLoading(false)
    }
  }

  const saveOverride = async () => {
    if (!locationId || !newOverrideDate) {
      toast.error('Select a date for the one-off schedule')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/bookings/settings/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: locationId,
          date: newOverrideDate,
          ...newOverride,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to save special date')
      toast.success('One-off schedule saved')
      setNewOverrideDate('')
      setNewOverride(buildDefaultScheduleOverride())
      await loadSchedule(locationId)
    } catch (error) {
      toast.error('Failed to save one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setLoading(false)
    }
  }

  const deleteOverride = async (id: string) => {
    if (!locationId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/bookings/settings/overrides/${id}`, {
        method: 'DELETE',
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to delete special date')
      toast.success('One-off schedule deleted')
      await loadSchedule(locationId)
    } catch (error) {
      toast.error('Failed to delete one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setLoading(false)
    }
  }

  return {
    weeklySettings,
    overrides,
    newOverrideDate,
    newOverride,
    loading,
    updateDay,
    setNewOverrideDate,
    updateOverride,
    saveWeekly,
    saveOverride,
    deleteOverride,
  }
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export function BookingWeeklyScheduleEditor({ model }: { model: BookingScheduleSettingsModel }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Weekly appointment hours</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            These are the normal hours used when a customer or colleague looks for a slot. Add a
            special date only when this weekly pattern changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void model.saveWeekly()}
          disabled={model.loading}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {model.loading ? 'Saving...' : 'Save weekly hours'}
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {model.weeklySettings.map((row) => (
          <div
            key={row.day_of_week}
            className="grid gap-3 px-4 py-4 lg:grid-cols-[130px_minmax(155px,1fr)_minmax(250px,1.25fr)_minmax(210px,1fr)_100px] lg:items-center"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {BOOKING_DAY_NAMES[row.day_of_week]}
              </p>
              <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={!row.is_closed}
                  onChange={(event) =>
                    model.updateDay(row.day_of_week, 'is_closed', !event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Accept bookings
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Open">
                <input
                  type="time"
                  disabled={row.is_closed}
                  value={row.open_time || ''}
                  onChange={(event) =>
                    model.updateDay(row.day_of_week, 'open_time', event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </LabeledField>
              <LabeledField label="Close">
                <input
                  type="time"
                  disabled={row.is_closed}
                  value={row.close_time || ''}
                  onChange={(event) =>
                    model.updateDay(row.day_of_week, 'close_time', event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </LabeledField>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Lunch break">
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    aria-label={`${BOOKING_DAY_NAMES[row.day_of_week]} lunch start`}
                    type="time"
                    disabled={row.is_closed}
                    value={row.lunch_start_time || ''}
                    onChange={(event) =>
                      model.updateDay(
                        row.day_of_week,
                        'lunch_start_time',
                        event.target.value || null,
                      )
                    }
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <input
                    aria-label={`${BOOKING_DAY_NAMES[row.day_of_week]} lunch end`}
                    type="time"
                    disabled={row.is_closed}
                    value={row.lunch_end_time || ''}
                    onChange={(event) =>
                      model.updateDay(row.day_of_week, 'lunch_end_time', event.target.value || null)
                    }
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>
              </LabeledField>
              <LabeledField label="Prayer break">
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    aria-label={`${BOOKING_DAY_NAMES[row.day_of_week]} prayer start`}
                    type="time"
                    disabled={row.is_closed}
                    value={row.prayer_start_time || ''}
                    onChange={(event) =>
                      model.updateDay(
                        row.day_of_week,
                        'prayer_start_time',
                        event.target.value || null,
                      )
                    }
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <input
                    aria-label={`${BOOKING_DAY_NAMES[row.day_of_week]} prayer end`}
                    type="time"
                    disabled={row.is_closed}
                    value={row.prayer_end_time || ''}
                    onChange={(event) =>
                      model.updateDay(
                        row.day_of_week,
                        'prayer_end_time',
                        event.target.value || null,
                      )
                    }
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>
              </LabeledField>
            </div>

            <LabeledField label="Concurrent staff">
              <input
                type="number"
                min={1}
                disabled={row.is_closed}
                value={row.concurrent_staff}
                onChange={(event) =>
                  model.updateDay(
                    row.day_of_week,
                    'concurrent_staff',
                    Math.max(1, Number(event.target.value) || 1),
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </LabeledField>
          </div>
        ))}
      </div>
    </section>
  )
}

export function BookingScheduleOverridesEditor({ model }: { model: BookingScheduleSettingsModel }) {
  const updateTime = (
    field: keyof Pick<
      BranchScheduleOverrideDraft,
      | 'open_time'
      | 'close_time'
      | 'lunch_start_time'
      | 'lunch_end_time'
      | 'prayer_start_time'
      | 'prayer_end_time'
    >,
    value: string,
  ) => model.updateOverride(field, value || null)

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Add one-off schedule</h3>
          <p className="mt-1 text-xs text-slate-500">
            Use this for bank holidays, closures, or a date with different hours and capacity.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <LabeledField label="Date">
            <input
              type="date"
              value={model.newOverrideDate}
              onChange={(event) => model.setNewOverrideDate(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Branch open time">
            <input
              type="time"
              value={model.newOverride.open_time || ''}
              onChange={(event) => updateTime('open_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Branch close time">
            <input
              type="time"
              value={model.newOverride.close_time || ''}
              onChange={(event) => updateTime('close_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Lunch break start">
            <input
              type="time"
              value={model.newOverride.lunch_start_time || ''}
              onChange={(event) => updateTime('lunch_start_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Lunch break end">
            <input
              type="time"
              value={model.newOverride.lunch_end_time || ''}
              onChange={(event) => updateTime('lunch_end_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Prayer break start">
            <input
              type="time"
              value={model.newOverride.prayer_start_time || ''}
              onChange={(event) => updateTime('prayer_start_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Prayer break end">
            <input
              type="time"
              value={model.newOverride.prayer_end_time || ''}
              onChange={(event) => updateTime('prayer_end_time', event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Concurrent staff">
            <input
              type="number"
              min={1}
              value={model.newOverride.concurrent_staff}
              onChange={(event) =>
                model.updateOverride(
                  'concurrent_staff',
                  Math.max(1, Number(event.target.value) || 1),
                )
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
          <LabeledField label="Slot interval (legacy)">
            <select
              value={model.newOverride.slot_interval_minutes}
              onChange={(event) =>
                model.updateOverride('slot_interval_minutes', Number(event.target.value))
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {INTERVAL_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min interval
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Notes (optional)">
            <input
              type="text"
              value={model.newOverride.notes || ''}
              onChange={(event) => model.updateOverride('notes', event.target.value || null)}
              placeholder="e.g. Bank Holiday"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </LabeledField>
        </div>
        <p className="text-xs text-slate-500">
          Concurrent staff is shared across all booking services. Keep this at 1 when one person
          handles the booking desk.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={model.newOverride.is_closed}
              onChange={(event) => model.updateOverride('is_closed', event.target.checked)}
            />
            Closed all day
          </label>
          <button
            type="button"
            onClick={() => void model.saveOverride()}
            disabled={model.loading}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {model.loading ? 'Saving...' : 'Save one-off schedule'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Upcoming one-off schedules
        </div>
        {model.overrides.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No one-off schedules configured
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {model.overrides.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {row.date}
                    {row.is_closed ? ' (Closed)' : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.open_time || '--'}-{row.close_time || '--'} | Lunch{' '}
                    {row.lunch_start_time || '--'}-{row.lunch_end_time || '--'} | Prayer{' '}
                    {row.prayer_start_time || '--'}-{row.prayer_end_time || '--'} | Staff{' '}
                    {row.concurrent_staff}
                    {row.notes ? ` | ${row.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void model.deleteOverride(row.id)}
                  disabled={model.loading}
                  className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
