'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ALLOWED_TEMPLATE_VARIABLES } from '@/lib/bookingEmailTemplate'
import { BOOKING_TEMPLATE_DEFAULTS, BookingEmailTemplateEditor } from './BookingEmailTemplateEditor'
import { BookingReminderSettingsPanel } from './BookingReminderSettingsPanel'
import {
  BOOKING_DAY_NAMES,
  BookingScheduleOverridesEditor,
  BookingWeeklyScheduleEditor,
  useBookingScheduleSettings,
} from './BookingScheduleSettings'

const TEMPLATE_VARIABLES = [...ALLOWED_TEMPLATE_VARIABLES]

function buildNewServiceDraft() {
  return {
    name: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: [] as number[],
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

export interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
  appointments_enabled?: boolean | null
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
  const schedule = useBookingScheduleSettings(selectedLocationId || null)

  const [services, setServices] = useState<BookingServiceRow[]>([])

  const [newService, setNewService] = useState(() => buildNewServiceDraft())
  const [showAddService, setShowAddService] = useState(false)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)

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
    () => schedule.weeklySettings.filter((setting) => !setting.is_closed).length,
    [schedule.weeklySettings],
  )

  const loadAll = async (locationId: string) => {
    if (!locationId) return

    setLoading(true)
    try {
      const servicesRes = await fetch(`/api/bookings/settings/services?location_id=${locationId}`)

      const servicesJson = await servicesRes.json()

      if (!servicesRes.ok) throw new Error(servicesJson.error || 'Failed to load services')

      setServices(((servicesJson.services || []) as BookingServiceRow[]).map(normalizeServiceRow))
    } catch (error) {
      toast.error('Failed to load booking settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedLocationId) {
      loadAll(selectedLocationId)
    }
  }, [selectedLocationId])

  const toggleServiceDay = (days: number[] | null, day: number): number[] => {
    const base = Array.isArray(days) ? days : []
    if (base.includes(day)) {
      return base.filter((d) => d !== day)
    }
    return [...base, day].sort((a, b) => a - b)
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
          <BookingWeeklyScheduleEditor model={schedule} />
          <BookingScheduleOverridesEditor model={schedule} />
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
                  {BOOKING_DAY_NAMES.map((name, day) => {
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
                <BookingEmailTemplateEditor
                  field="confirmation_template"
                  label="Booking Confirmation Email Template"
                  previewTitle="Confirmation"
                  value={newService.confirmation_template}
                  onChange={(value) =>
                    setNewService((current) => ({ ...current, confirmation_template: value }))
                  }
                  placeholder="Dear [Customer Name],\n\nYour appointment has been booked for [date booked] at [time booked] for [service booked]."
                />
                <BookingEmailTemplateEditor
                  field="modification_template"
                  label="Booking Modification Email Template"
                  previewTitle="Modification"
                  value={newService.modification_template}
                  onChange={(value) =>
                    setNewService((current) => ({ ...current, modification_template: value }))
                  }
                  placeholder="Dear [Customer Name],\n\nYour appointment has been updated to [date booked] at [time booked] for [service booked]."
                />
                <BookingEmailTemplateEditor
                  field="cancellation_template"
                  label="Booking Cancellation Email Template"
                  previewTitle="Cancellation"
                  value={newService.cancellation_template}
                  onChange={(value) =>
                    setNewService((current) => ({ ...current, cancellation_template: value }))
                  }
                  placeholder="Dear [Customer Name],\n\nYour appointment for [service booked] on [date booked] at [time booked] has been cancelled."
                />
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
                        {BOOKING_DAY_NAMES.map((name, day) => {
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
                      <BookingEmailTemplateEditor
                        field="confirmation_template"
                        label="Booking Confirmation Email Template"
                        previewTitle="Confirmation"
                        value={editingService.confirmation_template}
                        onChange={(value) =>
                          setEditingService((current) =>
                            current
                              ? { ...current, confirmation_template: value || null }
                              : current,
                          )
                        }
                      />
                      <BookingEmailTemplateEditor
                        field="modification_template"
                        label="Booking Modification Email Template"
                        previewTitle="Modification"
                        value={editingService.modification_template}
                        onChange={(value) =>
                          setEditingService((current) =>
                            current
                              ? { ...current, modification_template: value || null }
                              : current,
                          )
                        }
                      />
                      <BookingEmailTemplateEditor
                        field="cancellation_template"
                        label="Booking Cancellation Email Template"
                        previewTitle="Cancellation"
                        value={editingService.cancellation_template}
                        onChange={(value) =>
                          setEditingService((current) =>
                            current
                              ? { ...current, cancellation_template: value || null }
                              : current,
                          )
                        }
                      />
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
                          ? service.available_days
                              .map((d) => BOOKING_DAY_NAMES[d].slice(0, 3))
                              .join(', ')
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
        <BookingReminderSettingsPanel
          selectedLocationId={selectedLocationId}
          onEditServiceEmails={() => setActiveSection('services')}
        />
      )}
    </div>
  )
}
