'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ALLOWED_TEMPLATE_VARIABLES,
  type BookingTemplateValues,
  buildBookingEmailHtmlFromTemplate,
} from '@/lib/bookingEmailTemplate'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const INTERVAL_OPTIONS = [15, 20, 30, 45, 60]
const TEMPLATE_VARIABLES = [...ALLOWED_TEMPLATE_VARIABLES]
type TemplateField = 'confirmation_template' | 'modification_template' | 'cancellation_template'

const TEMPLATE_PRESETS: Record<TemplateField, Array<{ label: string; template: string }>> = {
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

const REMINDER_TEMPLATE_PRESETS = [
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

function buildNewServiceDraft() {
  return {
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: [] as number[],
    confirmation_template: TEMPLATE_PRESETS.confirmation_template[0].template,
    modification_template: TEMPLATE_PRESETS.modification_template[0].template,
    cancellation_template: TEMPLATE_PRESETS.cancellation_template[0].template,
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

const TEMPLATE_SAMPLE_VALUES: Record<string, string> = {
  '[Customer Name]': 'Alex Carter',
  '[date booked]': '24 Apr 2026',
  '[time booked]': '10:30',
  '[service booked]': 'Visa Consultation',
  '[branch name]': 'London Branch',
  '[branch address]': '12 Station Road, London, SW1A 1AA, United Kingdom',
  '[branch contact number]': '+44 2071234567',
}

function buildTemplatePreviewHtml(rawTemplate: string | null | undefined): string {
  const base = (rawTemplate || '').trim()
  const sampleValues: BookingTemplateValues = {
    'Customer Name': TEMPLATE_SAMPLE_VALUES['[Customer Name]'],
    'date booked': TEMPLATE_SAMPLE_VALUES['[date booked]'],
    'time booked': TEMPLATE_SAMPLE_VALUES['[time booked]'],
    'service booked': TEMPLATE_SAMPLE_VALUES['[service booked]'],
    'branch name': TEMPLATE_SAMPLE_VALUES['[branch name]'],
    'branch address': TEMPLATE_SAMPLE_VALUES['[branch address]'],
    'branch contact number': TEMPLATE_SAMPLE_VALUES['[branch contact number]'],
  }

  if (!base) {
    return buildBookingEmailHtmlFromTemplate(
      'Start typing a template to preview it here.',
      sampleValues,
    )
  }

  return buildBookingEmailHtmlFromTemplate(base, sampleValues)
}

export interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
  appointments_enabled?: boolean | null
}

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

export interface BookingServiceRow {
  id: string
  location_id: string
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
  is_active: boolean
}

interface BranchScheduleOverride {
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

interface BookingReminderSettings {
  location_id: string
  reminders_enabled: boolean
  reminder_hours_before: number
  same_day_reminder_enabled: boolean
  same_day_reminder_hours_before: number
  reminder_subject: string
  reminder_template: string
  attendance_confirmation_required: boolean
  penalty_enabled: boolean
  penalty_threshold: number
  penalty_action: 'warn_only' | 'block_until_manual_review'
  penalty_note: string | null
}

function buildDefaultReminderSettings(locationId: string): BookingReminderSettings {
  return {
    location_id: locationId,
    reminders_enabled: true,
    reminder_hours_before: 24,
    same_day_reminder_enabled: true,
    same_day_reminder_hours_before: 2,
    reminder_subject: 'Appointment reminder: [service booked] on [date booked] at [time booked]',
    reminder_template:
      'Dear [Customer Name],\n\nThis is a reminder that your [service booked] appointment is scheduled for [date booked] at [time booked] at [branch name].\n\nIf you cannot attend, please contact us as soon as possible.\n\nKind regards,\nPiyam Travel',
    attendance_confirmation_required: true,
    penalty_enabled: true,
    penalty_threshold: 3,
    penalty_action: 'block_until_manual_review',
    penalty_note:
      'Repeat no-show profile. Staff review required before accepting another appointment.',
  }
}

interface BookingSettingsTabProps {
  branchLocations: BranchLocationOption[]
  selectedLocationId: string
  onLocationChange: (locationId: string) => void
}

function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function TemplatePreview({
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

function TemplatePresetButtons({
  field,
  onApply,
}: {
  field: TemplateField
  onApply: (template: string) => void
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Presets
      </span>
      {TEMPLATE_PRESETS[field].map((preset) => (
        <button
          key={`${field}-${preset.label}`}
          type="button"
          onClick={() => onApply(preset.template)}
          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onApply('')}
        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
      >
        Clear
      </button>
    </div>
  )
}

function buildDefaultWeek(locationId: string): BranchSettingRow[] {
  return DAY_NAMES.map((_, day) => ({
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

function normalizeServiceRow(service: BookingServiceRow): BookingServiceRow {
  return {
    ...service,
    person_count_excludes_family_head: service.person_count_excludes_family_head !== false,
    close_overrun_tolerance_minutes: Math.max(0, service.close_overrun_tolerance_minutes ?? 15),
    customer_visible: service.customer_visible === true,
    customer_description: service.customer_description ?? null,
    customer_max_group_size: Math.min(100, Math.max(1, service.customer_max_group_size ?? 20)),
    customer_modification_cutoff_hours: Math.min(
      168,
      Math.max(0, service.customer_modification_cutoff_hours ?? 24),
    ),
  }
}

export default function BookingSettingsTab({
  branchLocations,
  selectedLocationId,
  onLocationChange,
}: BookingSettingsTabProps) {
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState<'overrides' | 'services' | 'reminders'>(
    'overrides',
  )

  const [weeklySettings, setWeeklySettings] = useState<BranchSettingRow[]>([])
  const [overrides, setOverrides] = useState<BranchScheduleOverride[]>([])
  const [services, setServices] = useState<BookingServiceRow[]>([])
  const [reminderSettings, setReminderSettings] = useState<BookingReminderSettings>(
    buildDefaultReminderSettings(selectedLocationId),
  )

  const [newService, setNewService] = useState(() => buildNewServiceDraft())
  const [showAddService, setShowAddService] = useState(false)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)
  const [activeNewTemplateField, setActiveNewTemplateField] =
    useState<TemplateField>('confirmation_template')
  const [activeEditTemplateField, setActiveEditTemplateField] =
    useState<TemplateField>('confirmation_template')
  const newTemplateRefs = useRef<Record<TemplateField, HTMLTextAreaElement | null>>({
    confirmation_template: null,
    modification_template: null,
    cancellation_template: null,
  })
  const editTemplateRefs = useRef<Record<TemplateField, HTMLTextAreaElement | null>>({
    confirmation_template: null,
    modification_template: null,
    cancellation_template: null,
  })
  const reminderTemplateRef = useRef<HTMLTextAreaElement | null>(null)

  const [newOverrideDate, setNewOverrideDate] = useState('')
  const [newOverride, setNewOverride] = useState<
    Omit<BranchScheduleOverride, 'id' | 'location_id' | 'date'>
  >({
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
  })

  const selectedBranch = useMemo(
    () => branchLocations.find((l) => l.id === selectedLocationId),
    [branchLocations, selectedLocationId],
  )
  const activeServiceCount = useMemo(
    () => services.filter((service) => service.is_active).length,
    [services],
  )
  const customerPortalServiceCount = useMemo(
    () => services.filter((service) => service.is_active && service.customer_visible).length,
    [services],
  )
  const weeklyOpenDayCount = useMemo(
    () => weeklySettings.filter((setting) => !setting.is_closed).length,
    [weeklySettings],
  )

  const loadAll = async (locationId: string) => {
    if (!locationId) return

    setLoading(true)
    try {
      const from = new Date()
      const to = new Date(from)
      to.setUTCDate(to.getUTCDate() + 60)

      const [weeklyRes, overridesRes, servicesRes, remindersRes] = await Promise.all([
        fetch(`/api/bookings/settings/branch?location_id=${locationId}`),
        fetch(
          `/api/bookings/settings/overrides?location_id=${locationId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`,
        ),
        fetch(`/api/bookings/settings/services?location_id=${locationId}`),
        fetch(`/api/bookings/settings/reminders?location_id=${locationId}`),
      ])

      const weeklyJson = await weeklyRes.json()
      const overridesJson = await overridesRes.json()
      const servicesJson = await servicesRes.json()
      const remindersJson = await remindersRes.json()

      if (!weeklyRes.ok) throw new Error(weeklyJson.error || 'Failed to load weekly settings')
      if (!overridesRes.ok) throw new Error(overridesJson.error || 'Failed to load overrides')
      if (!servicesRes.ok) throw new Error(servicesJson.error || 'Failed to load services')
      if (!remindersRes.ok) throw new Error(remindersJson.error || 'Failed to load reminders')

      const rows = (weeklyJson.settings || []) as BranchSettingRow[]
      setWeeklySettings(rows.length > 0 ? rows : buildDefaultWeek(locationId))
      setOverrides((overridesJson.overrides || []) as BranchScheduleOverride[])
      setServices(((servicesJson.services || []) as BookingServiceRow[]).map(normalizeServiceRow))
      setReminderSettings(
        (remindersJson.settings ||
          buildDefaultReminderSettings(locationId)) as BookingReminderSettings,
      )
    } catch (error) {
      toast.error('Failed to load booking settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setWeeklySettings(buildDefaultWeek(locationId))
      setOverrides([])
      setServices([])
      setReminderSettings(buildDefaultReminderSettings(locationId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedLocationId) {
      loadAll(selectedLocationId)
    }
  }, [selectedLocationId])

  const updateDay = (
    day: number,
    field: keyof BranchSettingRow,
    value: string | number | boolean | null,
  ) => {
    setWeeklySettings((prev) =>
      prev.map((row) => (row.day_of_week === day ? { ...row, [field]: value } : row)),
    )
  }

  const toggleServiceDay = (days: number[] | null, day: number): number[] => {
    const base = Array.isArray(days) ? days : []
    if (base.includes(day)) {
      return base.filter((d) => d !== day)
    }
    return [...base, day].sort((a, b) => a - b)
  }

  const insertTokenAtSelection = (
    currentValue: string,
    token: string,
    textarea: HTMLTextAreaElement | null,
  ) => {
    if (!textarea) {
      return `${currentValue}${currentValue.endsWith(' ') || currentValue.length === 0 ? '' : ' '}${token}`
    }

    const start = textarea.selectionStart ?? currentValue.length
    const end = textarea.selectionEnd ?? currentValue.length
    return `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`
  }

  const moveCursorAfterInsert = (textarea: HTMLTextAreaElement | null, tokenLength: number) => {
    if (!textarea) return
    const cursorStart = textarea.selectionStart ?? textarea.value.length
    const nextCursor = cursorStart + tokenLength
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const insertTemplateToken = (mode: 'new' | 'edit', token: string) => {
    if (mode === 'new') {
      const field = activeNewTemplateField
      const textarea = newTemplateRefs.current[field]
      setNewService((prev) => {
        const current = prev[field] || ''
        const next = insertTokenAtSelection(current, token, textarea)
        return { ...prev, [field]: next }
      })
      moveCursorAfterInsert(textarea, token.length)
      return
    }

    if (!editingService) return
    const field = activeEditTemplateField
    const textarea = editTemplateRefs.current[field]
    setEditingService((prev) => {
      if (!prev) return prev
      const current = prev[field] || ''
      const next = insertTokenAtSelection(current, token, textarea)
      return { ...prev, [field]: next }
    })
    moveCursorAfterInsert(textarea, token.length)
  }

  const insertReminderTemplateToken = (token: string) => {
    const textarea = reminderTemplateRef.current
    setReminderSettings((prev) => ({
      ...prev,
      reminder_template: insertTokenAtSelection(prev.reminder_template, token, textarea),
    }))
    moveCursorAfterInsert(textarea, token.length)
  }

  const applyTemplatePreset = (mode: 'new' | 'edit', field: TemplateField, template: string) => {
    if (mode === 'new') {
      setActiveNewTemplateField(field)
      setNewService((prev) => ({ ...prev, [field]: template }))
      return
    }

    setActiveEditTemplateField(field)
    setEditingService((prev) => (prev ? { ...prev, [field]: template || null } : prev))
  }

  const buildTemplateErrorMessage = (json: any): string => {
    if (!Array.isArray(json?.template_errors)) return json?.error || 'Invalid template variables'
    const details = json.template_errors
      .map(
        (entry: { field: string; invalidTokens: string[] }) =>
          `${entry.field}: ${entry.invalidTokens.join(', ')}`,
      )
      .join(' | ')
    return `${json.error || 'Template contains unsupported placeholders'} (${details})`
  }

  const saveWeekly = async () => {
    if (!selectedLocationId) return

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/branch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: selectedLocationId, settings: weeklySettings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Weekly branch settings saved')
      await loadAll(selectedLocationId)
    } catch (error) {
      toast.error('Failed to save weekly settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveOverride = async () => {
    if (!selectedLocationId || !newOverrideDate) {
      toast.error('Select a date for the one-off schedule')
      return
    }

    setLoading(true)
    try {
      const payload = {
        location_id: selectedLocationId,
        date: newOverrideDate,
        ...newOverride,
      }

      const res = await fetch('/api/bookings/settings/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success('One-off schedule saved')
      setNewOverrideDate('')
      await loadAll(selectedLocationId)
    } catch (error) {
      toast.error('Failed to save one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteOverride = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/overrides/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setOverrides((prev) => prev.filter((o) => o.id !== id))
      toast.success('One-off schedule deleted')
    } catch (error) {
      toast.error('Failed to delete one-off schedule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const addService = async () => {
    if (!selectedLocationId || !newService.name.trim()) {
      toast.error('Service name is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: selectedLocationId,
          name: newService.name,
          duration_minutes: newService.duration_minutes,
          buffer_minutes: newService.buffer_minutes,
          available_days: newService.available_days,
          service_start_time: newService.service_start_time || null,
          service_end_time: newService.service_end_time || null,
          confirmation_template: newService.confirmation_template || null,
          modification_template: newService.modification_template || null,
          cancellation_template: newService.cancellation_template || null,
          duration_per_additional_person_minutes: newService.duration_per_additional_person_minutes,
          person_count_excludes_family_head: newService.person_count_excludes_family_head,
          close_overrun_tolerance_minutes: newService.close_overrun_tolerance_minutes,
          customer_visible: newService.customer_visible,
          customer_description: newService.customer_description || null,
          customer_max_group_size: newService.customer_max_group_size,
          customer_modification_cutoff_hours: newService.customer_modification_cutoff_hours,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(buildTemplateErrorMessage(json))
      setServices((prev) => [...prev, normalizeServiceRow(json.service as BookingServiceRow)])
      setNewService(buildNewServiceDraft())
      setShowAddService(false)
      toast.success('Service added')
    } catch (error) {
      toast.error('Failed to add service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveService = async () => {
    if (!editingService) return

    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${editingService.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingService.name,
          duration_minutes: editingService.duration_minutes,
          buffer_minutes: editingService.buffer_minutes,
          available_days: editingService.available_days,
          service_start_time: editingService.service_start_time,
          service_end_time: editingService.service_end_time,
          confirmation_template: editingService.confirmation_template,
          modification_template: editingService.modification_template,
          cancellation_template: editingService.cancellation_template,
          duration_per_additional_person_minutes:
            editingService.duration_per_additional_person_minutes,
          person_count_excludes_family_head: editingService.person_count_excludes_family_head,
          close_overrun_tolerance_minutes: editingService.close_overrun_tolerance_minutes,
          customer_visible: editingService.customer_visible,
          customer_description: editingService.customer_description,
          customer_max_group_size: editingService.customer_max_group_size,
          customer_modification_cutoff_hours: editingService.customer_modification_cutoff_hours,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(buildTemplateErrorMessage(json))
      setServices((prev) =>
        prev.map((s) =>
          s.id === editingService.id ? normalizeServiceRow(json.service as BookingServiceRow) : s,
        ),
      )
      setEditingService(null)
      toast.success('Service updated')
    } catch (error) {
      toast.error('Failed to update service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleService = async (service: BookingServiceRow) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !service.is_active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? normalizeServiceRow(json.service as BookingServiceRow) : s,
        ),
      )
    } catch (error) {
      toast.error('Failed to update service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const removeService = async (serviceId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/settings/services/${serviceId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setServices((prev) => prev.filter((s) => s.id !== serviceId))
      toast.success('Service deleted')
    } catch (error) {
      toast.error('Failed to delete service', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveReminders = async () => {
    if (!selectedLocationId) return

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/settings/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: selectedLocationId,
          settings: reminderSettings,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save reminder settings')

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
      <section className="overflow-hidden rounded-[24px] border border-indigo-100 bg-[linear-gradient(135deg,_#eff6ff_0%,_#eef2ff_48%,_#ffffff_100%)] shadow-[0_18px_50px_-36px_rgba(30,58,138,0.45)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Booking setup
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Appointments, your way</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Set the branch timetable, make services bookable on the customer portal, and keep
              every customer email on-brand from one place.
            </p>
          </div>
          <label className="block min-w-[250px] text-sm font-semibold text-slate-700">
            Branch
            <select
              value={selectedLocationId}
              onChange={(e) => onLocationChange(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {branchLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.branch_code ? ` (${location.branch_code})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid border-t border-indigo-100 bg-white/70 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-b border-indigo-100 px-5 py-4 sm:border-r lg:border-b-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Branch
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {selectedBranch?.name || 'Select a branch'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedBranch?.appointments_enabled === false
                ? 'Appointments paused'
                : 'Appointments active'}
            </p>
          </div>
          <div className="border-b border-indigo-100 px-5 py-4 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Weekly hours
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {weeklyOpenDayCount} days open
            </p>
            <p className="mt-1 text-xs text-slate-500">Capacity and breaks included</p>
          </div>
          <div className="border-b border-indigo-100 px-5 py-4 sm:border-r lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Live services
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{activeServiceCount} active</p>
            <p className="mt-1 text-xs text-slate-500">{services.length} configured in total</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Customer portal
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {customerPortalServiceCount} bookable
            </p>
            <p className="mt-1 text-xs text-slate-500">Each confirmation includes a VISIT code</p>
          </div>
        </div>
      </section>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-3">
        {[
          {
            id: 'overrides' as const,
            title: 'Hours & special dates',
            detail: 'Weekly availability, capacity, breaks, and exceptions',
          },
          {
            id: 'services' as const,
            title: 'Services & customer portal',
            detail: 'Slot rules, portal visibility, codes, and email copy',
          },
          {
            id: 'reminders' as const,
            title: 'Messages & attendance',
            detail: 'Reminders, attendance confirmation, and no-show rules',
          },
        ].map((section) => {
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              aria-pressed={active}
              className={`rounded-xl px-4 py-3 text-left transition ${
                active
                  ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-100'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <span className="block text-sm font-semibold">{section.title}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{section.detail}</span>
            </button>
          )
        })}
      </div>

      {activeSection === 'overrides' && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Weekly appointment hours</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These are the normal hours used when a customer or colleague looks for a slot. Add
                  a special date below only when this weekly pattern changes.
                </p>
              </div>
              <button
                type="button"
                onClick={saveWeekly}
                disabled={loading}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save weekly hours'}
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {weeklySettings.map((row) => (
                <div
                  key={row.day_of_week}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[130px_minmax(155px,1fr)_minmax(250px,1.25fr)_minmax(210px,1fr)_100px] lg:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {DAY_NAMES[row.day_of_week]}
                    </p>
                    <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={!row.is_closed}
                        onChange={(e) => updateDay(row.day_of_week, 'is_closed', !e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      Accept bookings
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <LabeledInput label="Open">
                      <input
                        type="time"
                        disabled={row.is_closed}
                        value={row.open_time || ''}
                        onChange={(e) => updateDay(row.day_of_week, 'open_time', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </LabeledInput>
                    <LabeledInput label="Close">
                      <input
                        type="time"
                        disabled={row.is_closed}
                        value={row.close_time || ''}
                        onChange={(e) => updateDay(row.day_of_week, 'close_time', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </LabeledInput>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <LabeledInput label="Lunch break">
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          aria-label={`${DAY_NAMES[row.day_of_week]} lunch start`}
                          type="time"
                          disabled={row.is_closed}
                          value={row.lunch_start_time || ''}
                          onChange={(e) =>
                            updateDay(row.day_of_week, 'lunch_start_time', e.target.value || null)
                          }
                          className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                        <input
                          aria-label={`${DAY_NAMES[row.day_of_week]} lunch end`}
                          type="time"
                          disabled={row.is_closed}
                          value={row.lunch_end_time || ''}
                          onChange={(e) =>
                            updateDay(row.day_of_week, 'lunch_end_time', e.target.value || null)
                          }
                          className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </div>
                    </LabeledInput>
                    <LabeledInput label="Prayer break">
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          aria-label={`${DAY_NAMES[row.day_of_week]} prayer start`}
                          type="time"
                          disabled={row.is_closed}
                          value={row.prayer_start_time || ''}
                          onChange={(e) =>
                            updateDay(row.day_of_week, 'prayer_start_time', e.target.value || null)
                          }
                          className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                        <input
                          aria-label={`${DAY_NAMES[row.day_of_week]} prayer end`}
                          type="time"
                          disabled={row.is_closed}
                          value={row.prayer_end_time || ''}
                          onChange={(e) =>
                            updateDay(row.day_of_week, 'prayer_end_time', e.target.value || null)
                          }
                          className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </div>
                    </LabeledInput>
                  </div>

                  <LabeledInput label="Concurrent staff">
                    <input
                      type="number"
                      min={1}
                      disabled={row.is_closed}
                      value={row.concurrent_staff}
                      onChange={(e) =>
                        updateDay(
                          row.day_of_week,
                          'concurrent_staff',
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </LabeledInput>
                </div>
              ))}
            </div>
          </section>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              Add One-off Schedule (special date)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LabeledInput label="Date">
                <input
                  type="date"
                  value={newOverrideDate}
                  onChange={(e) => setNewOverrideDate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Branch Open Time">
                <input
                  type="time"
                  value={newOverride.open_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, open_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Branch Close Time">
                <input
                  type="time"
                  value={newOverride.close_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, close_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Lunch Break Start">
                <input
                  type="time"
                  value={newOverride.lunch_start_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, lunch_start_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Lunch Break End">
                <input
                  type="time"
                  value={newOverride.lunch_end_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, lunch_end_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Prayer Break Start">
                <input
                  type="time"
                  value={newOverride.prayer_start_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, prayer_start_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Prayer Break End">
                <input
                  type="time"
                  value={newOverride.prayer_end_time || ''}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, prayer_end_time: e.target.value || null }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Concurrent Staff (all services)">
                <input
                  type="number"
                  min={1}
                  value={newOverride.concurrent_staff}
                  onChange={(e) =>
                    setNewOverride((p) => ({
                      ...p,
                      concurrent_staff: Math.max(1, Number(e.target.value)),
                    }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Slot Interval (deprecated: use service slots)">
                <select
                  value={newOverride.slot_interval_minutes}
                  onChange={(e) =>
                    setNewOverride((p) => ({ ...p, slot_interval_minutes: Number(e.target.value) }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                >
                  {INTERVAL_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v} min interval
                    </option>
                  ))}
                </select>
              </LabeledInput>
            </div>
            <p className="text-xs text-slate-500">
              Concurrent staff is shared across all booking services. If one person handles
              appointments, keep this at 1 so services cannot overlap.
            </p>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={newOverride.is_closed}
                  onChange={(e) => setNewOverride((p) => ({ ...p, is_closed: e.target.checked }))}
                />{' '}
                Closed all day
              </label>
              <button
                onClick={saveOverride}
                disabled={loading}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save One-off Schedule'}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
              Upcoming One-off Schedules
            </div>
            {overrides.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 text-center">
                No one-off schedules configured
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overrides.map((row) => (
                  <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-4">
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
                      </p>
                    </div>
                    <button
                      onClick={() => deleteOverride(row.id)}
                      className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-600 bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'services' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Services and slot rules</h3>
              <p className="mt-1 text-sm text-slate-500">
                Define duration, capacity spacing, service hours, customer-portal availability, and
                the message customers receive.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewService(buildNewServiceDraft())
                setShowAddService(true)
              }}
              className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              + Add Service
            </button>
          </div>

          <section className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,_#eff6ff_0%,_#ffffff_72%)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-indigo-950">
                  Customer portal and booking codes
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-800">
                  Only active services marked as customer-visible appear in the customer portal. A
                  confirmation email includes a private <strong>VISIT</strong> code so a signed-in
                  customer can claim a staff-created appointment; secure management links remain
                  separate from that code.
                </p>
              </div>
              <span className="w-fit rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700">
                {customerPortalServiceCount} service{customerPortalServiceCount === 1 ? '' : 's'}{' '}
                live
              </span>
            </div>
          </section>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">Email copy and visual theme</p>
            <p className="mt-1">
              Every appointment email now uses the Piyam Travel navy theme, company logo, and an
              appointment summary. Use square brackets exactly as shown to personalise the copy.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((token) => (
                <span
                  key={token}
                  className="rounded bg-white border border-blue-200 px-2 py-1 text-xs text-blue-800"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>

          {showAddService && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <LabeledInput label="Service Name">
                <input
                  type="text"
                  value={newService.name}
                  onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Medical"
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Duration (minutes)">
                <input
                  type="number"
                  min={5}
                  value={newService.duration_minutes}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, duration_minutes: Number(e.target.value) }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Buffer (minutes)">
                <input
                  type="number"
                  min={0}
                  value={newService.buffer_minutes}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, buffer_minutes: Number(e.target.value) }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Service Start Time">
                <input
                  type="time"
                  value={newService.service_start_time}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, service_start_time: e.target.value }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Service End Time">
                <input
                  type="time"
                  value={newService.service_end_time}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, service_end_time: e.target.value }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </LabeledInput>
              <LabeledInput label="Extra Time per Additional Person (minutes)">
                <input
                  type="number"
                  min={0}
                  value={newService.duration_per_additional_person_minutes}
                  onChange={(e) =>
                    setNewService((p) => ({
                      ...p,
                      duration_per_additional_person_minutes: Math.max(0, Number(e.target.value)),
                    }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  e.g. 22 mins → 3 people ≈ 2.5 slots
                </p>
              </LabeledInput>
              <LabeledInput label="Close-Time Overrun Allowed (minutes)">
                <input
                  type="number"
                  min={0}
                  value={newService.close_overrun_tolerance_minutes}
                  onChange={(e) =>
                    setNewService((p) => ({
                      ...p,
                      close_overrun_tolerance_minutes: Math.max(0, Number(e.target.value)),
                    }))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Allows an appointment to finish this many minutes after service close time.
                </p>
              </LabeledInput>
              <LabeledInput label="Person Count Rule">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newService.person_count_excludes_family_head}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        person_count_excludes_family_head: e.target.checked,
                      }))
                    }
                  />
                  Person count excludes family head
                </label>
              </LabeledInput>
              <div className="md:col-span-3 rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-medium text-slate-500 mb-2">Available days</p>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, day) => {
                    const active = newService.available_days.includes(day)
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setNewService((p) => ({
                            ...p,
                            available_days: toggleServiceDay(p.available_days, day),
                          }))
                        }
                        className={`px-2 py-1 rounded text-xs border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="md:col-span-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-indigo-950">Customer portal listing</p>
                    <p className="mt-1 text-xs leading-5 text-indigo-800">
                      Keep this off for internal-only services. Turn it on only when customers can
                      select this service in the customer portal.
                    </p>
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-800">
                    <input
                      type="checkbox"
                      checked={newService.customer_visible}
                      onChange={(e) =>
                        setNewService((p) => ({ ...p, customer_visible: e.target.checked }))
                      }
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
                      value={newService.customer_description}
                      onChange={(e) =>
                        setNewService((p) => ({ ...p, customer_description: e.target.value }))
                      }
                      placeholder="Tell customers what this appointment is for and what to bring."
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                    />
                  </LabeledInput>
                  <LabeledInput label="Maximum group size">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newService.customer_max_group_size}
                      onChange={(e) =>
                        setNewService((p) => ({
                          ...p,
                          customer_max_group_size: Math.min(
                            100,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                    />
                  </LabeledInput>
                  <LabeledInput label="Change/cancel cutoff (hours)">
                    <input
                      type="number"
                      min={0}
                      max={168}
                      value={newService.customer_modification_cutoff_hours}
                      onChange={(e) =>
                        setNewService((p) => ({
                          ...p,
                          customer_modification_cutoff_hours: Math.min(
                            168,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                    />
                  </LabeledInput>
                </div>
              </div>
              <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <LabeledInput label="Booking Confirmation Email Template">
                  <>
                    <TemplatePresetButtons
                      field="confirmation_template"
                      onApply={(template) =>
                        applyTemplatePreset('new', 'confirmation_template', template)
                      }
                    />
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button
                          key={`new-confirmation-${token}`}
                          type="button"
                          onClick={() => insertTemplateToken('new', token)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={(el) => {
                        newTemplateRefs.current.confirmation_template = el
                      }}
                      value={newService.confirmation_template}
                      onFocus={() => setActiveNewTemplateField('confirmation_template')}
                      onChange={(e) =>
                        setNewService((p) => ({ ...p, confirmation_template: e.target.value }))
                      }
                      rows={6}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      placeholder="Dear [Customer Name],\n\nYour appointment has been booked for [date booked] at [time booked] for [service booked]."
                    />
                    <TemplatePreview
                      title="Confirmation"
                      template={newService.confirmation_template}
                    />
                  </>
                </LabeledInput>
                <LabeledInput label="Booking Modification Email Template">
                  <>
                    <TemplatePresetButtons
                      field="modification_template"
                      onApply={(template) =>
                        applyTemplatePreset('new', 'modification_template', template)
                      }
                    />
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button
                          key={`new-modification-${token}`}
                          type="button"
                          onClick={() => insertTemplateToken('new', token)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={(el) => {
                        newTemplateRefs.current.modification_template = el
                      }}
                      value={newService.modification_template}
                      onFocus={() => setActiveNewTemplateField('modification_template')}
                      onChange={(e) =>
                        setNewService((p) => ({ ...p, modification_template: e.target.value }))
                      }
                      rows={6}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      placeholder="Dear [Customer Name],\n\nYour appointment has been updated to [date booked] at [time booked] for [service booked]."
                    />
                    <TemplatePreview
                      title="Modification"
                      template={newService.modification_template}
                    />
                  </>
                </LabeledInput>
                <LabeledInput label="Booking Cancellation Email Template">
                  <>
                    <TemplatePresetButtons
                      field="cancellation_template"
                      onApply={(template) =>
                        applyTemplatePreset('new', 'cancellation_template', template)
                      }
                    />
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((token) => (
                        <button
                          key={`new-cancellation-${token}`}
                          type="button"
                          onClick={() => insertTemplateToken('new', token)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={(el) => {
                        newTemplateRefs.current.cancellation_template = el
                      }}
                      value={newService.cancellation_template}
                      onFocus={() => setActiveNewTemplateField('cancellation_template')}
                      onChange={(e) =>
                        setNewService((p) => ({ ...p, cancellation_template: e.target.value }))
                      }
                      rows={6}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      placeholder="Dear [Customer Name],\n\nYour appointment for [service booked] on [date booked] at [time booked] has been cancelled."
                    />
                    <TemplatePreview
                      title="Cancellation"
                      template={newService.cancellation_template}
                    />
                  </>
                </LabeledInput>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addService}
                  disabled={loading}
                  className="px-3 py-2 rounded bg-indigo-600 text-white text-sm disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddService(false)}
                  className="px-3 py-2 rounded border border-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {services.map((service) => (
              <div key={service.id} className="rounded-lg border border-slate-200 bg-white p-4">
                {editingService?.id === service.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                    <LabeledInput label="Service Name">
                      <input
                        type="text"
                        value={editingService.name}
                        onChange={(e) =>
                          setEditingService((p) => (p ? { ...p, name: e.target.value } : p))
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </LabeledInput>
                    <LabeledInput label="Duration (minutes)">
                      <input
                        type="number"
                        min={5}
                        value={editingService.duration_minutes}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p ? { ...p, duration_minutes: Number(e.target.value) } : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </LabeledInput>
                    <LabeledInput label="Buffer (minutes)">
                      <input
                        type="number"
                        min={0}
                        value={editingService.buffer_minutes}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p ? { ...p, buffer_minutes: Number(e.target.value) } : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </LabeledInput>
                    <LabeledInput label="Service Start Time">
                      <input
                        type="time"
                        value={editingService.service_start_time || ''}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p ? { ...p, service_start_time: e.target.value || null } : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </LabeledInput>
                    <LabeledInput label="Service End Time">
                      <input
                        type="time"
                        value={editingService.service_end_time || ''}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p ? { ...p, service_end_time: e.target.value || null } : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                    </LabeledInput>
                    <LabeledInput label="Extra Time per Additional Person (minutes)">
                      <input
                        type="number"
                        min={0}
                        value={editingService.duration_per_additional_person_minutes ?? 0}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p
                              ? {
                                  ...p,
                                  duration_per_additional_person_minutes: Math.max(
                                    0,
                                    Number(e.target.value),
                                  ),
                                }
                              : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        e.g. 22 mins → 3 people ≈ 2.5 slots
                      </p>
                    </LabeledInput>
                    <LabeledInput label="Close-Time Overrun Allowed (minutes)">
                      <input
                        type="number"
                        min={0}
                        value={editingService.close_overrun_tolerance_minutes ?? 15}
                        onChange={(e) =>
                          setEditingService((p) =>
                            p
                              ? {
                                  ...p,
                                  close_overrun_tolerance_minutes: Math.max(
                                    0,
                                    Number(e.target.value),
                                  ),
                                }
                              : p,
                          )
                        }
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Allows an appointment to finish this many minutes after service close time.
                      </p>
                    </LabeledInput>
                    <LabeledInput label="Person Count Rule">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editingService.person_count_excludes_family_head}
                          onChange={(e) =>
                            setEditingService((p) =>
                              p ? { ...p, person_count_excludes_family_head: e.target.checked } : p,
                            )
                          }
                        />
                        Person count excludes family head
                      </label>
                    </LabeledInput>
                    <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-500 mb-2">Available days</p>
                      <div className="flex flex-wrap gap-2">
                        {DAY_NAMES.map((name, day) => {
                          const active =
                            Array.isArray(editingService.available_days) &&
                            editingService.available_days.includes(day)
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() =>
                                setEditingService((p) =>
                                  p
                                    ? {
                                        ...p,
                                        available_days: toggleServiceDay(p.available_days, day),
                                      }
                                    : p,
                                )
                              }
                              className={`px-2 py-1 rounded text-xs border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                            >
                              {name.slice(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="md:col-span-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-indigo-950">
                            Customer portal listing
                          </p>
                          <p className="mt-1 text-xs leading-5 text-indigo-800">
                            A customer-visible service can be booked online for this branch. The
                            booking email supplies a VISIT code for customers to claim a
                            staff-created appointment later.
                          </p>
                        </div>
                        <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-800">
                          <input
                            type="checkbox"
                            checked={editingService.customer_visible}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p ? { ...p, customer_visible: e.target.checked } : p,
                              )
                            }
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
                            value={editingService.customer_description || ''}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p ? { ...p, customer_description: e.target.value || null } : p,
                              )
                            }
                            placeholder="Tell customers what this appointment is for and what to bring."
                            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                          />
                        </LabeledInput>
                        <LabeledInput label="Maximum group size">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={editingService.customer_max_group_size}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p
                                  ? {
                                      ...p,
                                      customer_max_group_size: Math.min(
                                        100,
                                        Math.max(1, Number(e.target.value) || 1),
                                      ),
                                    }
                                  : p,
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
                            value={editingService.customer_modification_cutoff_hours}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p
                                  ? {
                                      ...p,
                                      customer_modification_cutoff_hours: Math.min(
                                        168,
                                        Math.max(0, Number(e.target.value) || 0),
                                      ),
                                    }
                                  : p,
                              )
                            }
                            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                          />
                        </LabeledInput>
                      </div>
                    </div>
                    <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LabeledInput label="Booking Confirmation Email Template">
                        <>
                          <TemplatePresetButtons
                            field="confirmation_template"
                            onApply={(template) =>
                              applyTemplatePreset('edit', 'confirmation_template', template)
                            }
                          />
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button
                                key={`edit-confirmation-${service.id}-${token}`}
                                type="button"
                                onClick={() => insertTemplateToken('edit', token)}
                                className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                              >
                                {token}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={(el) => {
                              editTemplateRefs.current.confirmation_template = el
                            }}
                            value={editingService.confirmation_template || ''}
                            onFocus={() => setActiveEditTemplateField('confirmation_template')}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p ? { ...p, confirmation_template: e.target.value || null } : p,
                              )
                            }
                            rows={6}
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                          />
                          <TemplatePreview
                            title="Confirmation"
                            template={editingService.confirmation_template}
                          />
                        </>
                      </LabeledInput>
                      <LabeledInput label="Booking Modification Email Template">
                        <>
                          <TemplatePresetButtons
                            field="modification_template"
                            onApply={(template) =>
                              applyTemplatePreset('edit', 'modification_template', template)
                            }
                          />
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button
                                key={`edit-modification-${service.id}-${token}`}
                                type="button"
                                onClick={() => insertTemplateToken('edit', token)}
                                className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                              >
                                {token}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={(el) => {
                              editTemplateRefs.current.modification_template = el
                            }}
                            value={editingService.modification_template || ''}
                            onFocus={() => setActiveEditTemplateField('modification_template')}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p ? { ...p, modification_template: e.target.value || null } : p,
                              )
                            }
                            rows={6}
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                          />
                          <TemplatePreview
                            title="Modification"
                            template={editingService.modification_template}
                          />
                        </>
                      </LabeledInput>
                      <LabeledInput label="Booking Cancellation Email Template">
                        <>
                          <TemplatePresetButtons
                            field="cancellation_template"
                            onApply={(template) =>
                              applyTemplatePreset('edit', 'cancellation_template', template)
                            }
                          />
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((token) => (
                              <button
                                key={`edit-cancellation-${service.id}-${token}`}
                                type="button"
                                onClick={() => insertTemplateToken('edit', token)}
                                className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                              >
                                {token}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={(el) => {
                              editTemplateRefs.current.cancellation_template = el
                            }}
                            value={editingService.cancellation_template || ''}
                            onFocus={() => setActiveEditTemplateField('cancellation_template')}
                            onChange={(e) =>
                              setEditingService((p) =>
                                p ? { ...p, cancellation_template: e.target.value || null } : p,
                              )
                            }
                            rows={6}
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                          />
                          <TemplatePreview
                            title="Cancellation"
                            template={editingService.cancellation_template}
                          />
                        </>
                      </LabeledInput>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveService}
                        className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingService(null)}
                        className="px-3 py-2 rounded border border-slate-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{service.name}</p>
                      <p className="text-xs text-slate-500">
                        Duration {service.duration_minutes} min · Buffer {service.buffer_minutes}{' '}
                        min
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Days:{' '}
                        {Array.isArray(service.available_days) && service.available_days.length > 0
                          ? service.available_days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')
                          : 'All'}{' '}
                        · Time: {service.service_start_time || 'Branch open'} -{' '}
                        {service.service_end_time || 'Branch close'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Additional person time: +
                        {service.duration_per_additional_person_minutes ?? 0} min per person entered
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Person count rule:{' '}
                        {service.person_count_excludes_family_head
                          ? 'Excludes family head'
                          : 'Includes family head'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Close-time overrun allowed: {service.close_overrun_tolerance_minutes ?? 15}{' '}
                        min
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Templates: {service.confirmation_template ? 'Booked' : '--'} /{' '}
                        {service.modification_template ? 'Modified' : '--'} /{' '}
                        {service.cancellation_template ? 'Cancelled' : '--'}
                      </p>
                      <p className="mt-2 text-xs font-medium text-indigo-700">
                        Customer portal:{' '}
                        {service.customer_visible && service.is_active
                          ? `Live · up to ${service.customer_max_group_size} people · ${service.customer_modification_cutoff_hours}h change/cancel cutoff`
                          : 'Internal only'}
                      </p>
                      {service.customer_visible && service.customer_description && (
                        <p className="mt-1 max-w-2xl text-xs text-slate-500">
                          {service.customer_description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingService(normalizeServiceRow(service))}
                        className="px-3 py-1.5 rounded border border-slate-300 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleService(service)}
                        className={`px-3 py-1.5 rounded text-xs ${service.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                      >
                        {service.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => removeService(service.id)}
                        className="px-3 py-1.5 rounded bg-red-50 text-red-600 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {services.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">
                No services for this branch yet
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'reminders' && (
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
                    confirmation, change and cancellation emails stay available alongside each
                    service.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('services')}
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
                  Written per service, so the customer receives the right message for their
                  appointment.
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
                <p className="mt-2 text-sm font-semibold text-[#4d1a25]">
                  Visit code stays protected
                </p>
                <p className="mt-1 text-xs leading-5 text-[#76505a]">
                  Booking confirmations append the customer&apos;s portal access details separately,
                  so a template edit cannot remove them.
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
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  When customers hear from you
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Set both reminder windows independently. The second one is useful for customers
                  who book several days ahead, without sending duplicate messages.
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
                <TemplatePreview
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
                <h3 className="mt-1 text-lg font-bold text-[#521723]">
                  Make the reminder actionable
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69434b]">
                  Add an appointment-specific response link to the reminder. Choosing Present marks
                  the booking as present; choosing Unable to attend marks it missed and feeds the
                  repeat no-show record. The customer only receives this response link, never staff
                  portal access.
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
              <h3 className="mt-1 text-lg font-bold text-amber-950">
                Keep the policy clear for staff
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
                Missed appointments are matched by phone or email, not name, to avoid common-name
                false matches. You can keep this as a staff warning or require a staff review before
                another booking.
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
                onClick={() =>
                  setReminderSettings(buildDefaultReminderSettings(selectedLocationId))
                }
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
      )}
    </div>
  )
}
