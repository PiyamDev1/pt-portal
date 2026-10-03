'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ALLOWED_TEMPLATE_VARIABLES } from '@/lib/bookingEmailTemplate'
import {
  BookingServiceFormFields,
  buildDefaultBookingServiceForm,
  type BookingServiceFormValue,
} from './BookingServiceFormFields'
import { BOOKING_DAY_NAMES } from './BookingScheduleSettings'

const TEMPLATE_VARIABLES = [...ALLOWED_TEMPLATE_VARIABLES]

export interface BookingServiceRow extends BookingServiceFormValue {
  id: string
  location_id: string
  is_active: boolean
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

export function useBookingServiceSettings(selectedLocationId: string) {
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<BookingServiceRow[]>([])

  const [newService, setNewService] = useState(() => buildDefaultBookingServiceForm())
  const [showAddService, setShowAddService] = useState(false)
  const [editingService, setEditingService] = useState<BookingServiceRow | null>(null)

  const activeServiceCount = useMemo(
    () => services.filter((service) => service.is_active).length,
    [services],
  )
  const customerPortalServiceCount = useMemo(
    () => services.filter((service) => service.is_active && service.customer_visible).length,
    [services],
  )
  useEffect(() => {
    if (!selectedLocationId) {
      setServices([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)

    void (async () => {
      try {
        const response = await fetch(
          `/api/bookings/settings/services?location_id=${selectedLocationId}`,
        )
        const json = await response.json()

        if (!response.ok) throw new Error(json.error || 'Failed to load services')
        if (active) {
          setServices(((json.services || []) as BookingServiceRow[]).map(normalizeServiceRow))
        }
      } catch (error) {
        if (active) {
          setServices([])
          toast.error('Failed to load booking settings', {
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
      setNewService(buildDefaultBookingServiceForm())
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

  return {
    loading,
    services,
    newService,
    setNewService,
    showAddService,
    setShowAddService,
    editingService,
    setEditingService,
    activeServiceCount,
    customerPortalServiceCount,
    addService,
    saveService,
    toggleService,
    removeService,
  }
}

export type BookingServiceSettingsModel = ReturnType<typeof useBookingServiceSettings>

export function BookingServiceSettingsPanel({ model }: { model: BookingServiceSettingsModel }) {
  const {
    loading,
    services,
    newService,
    setNewService,
    showAddService,
    setShowAddService,
    editingService,
    setEditingService,
    customerPortalServiceCount,
    addService,
    saveService,
    toggleService,
    removeService,
  } = model

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Services and slot rules</h3>
          <p className="mt-1 text-sm text-slate-500">
            Define duration, capacity spacing, service hours, customer-portal availability, and the
            message customers receive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewService(buildDefaultBookingServiceForm())
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
            {customerPortalServiceCount} service{customerPortalServiceCount === 1 ? '' : 's'} live
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
        <div className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-5">
          <BookingServiceFormFields value={newService} onChange={setNewService} />
          <div className="flex gap-2">
            <button
              onClick={addService}
              disabled={loading}
              className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddService(false)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
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
              <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
                <BookingServiceFormFields
                  value={editingService}
                  onChange={(nextValue) =>
                    setEditingService((current) =>
                      current ? { ...current, ...nextValue } : current,
                    )
                  }
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveService}
                    disabled={loading}
                    className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingService(null)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
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
                    Duration {service.duration_minutes} min · Buffer {service.buffer_minutes} min
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
                    Additional person time: +{service.duration_per_additional_person_minutes ?? 0}{' '}
                    min per person entered
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Person count rule:{' '}
                    {service.person_count_excludes_family_head
                      ? 'Excludes family head'
                      : 'Includes family head'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Close-time overrun allowed: {service.close_overrun_tolerance_minutes ?? 15} min
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
  )
}
