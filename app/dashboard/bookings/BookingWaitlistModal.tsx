'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookingSource } from '@/app/types/bookings'

interface BookingServiceOption {
  id: string
  name: string
}

export default function BookingWaitlistModal({
  isOpen,
  locationId,
  serviceOptions,
  initialServiceId,
  initialDate,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  locationId: string
  serviceOptions: BookingServiceOption[]
  initialServiceId: string
  initialDate: string
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    service_id: initialServiceId || '',
    preferred_date: initialDate || '',
    preferred_time_start: '',
    preferred_time_end: '',
    person_count: 1,
    notes: '',
    source: BookingSource.PORTAL,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm((current) => ({
      ...current,
      service_id: initialServiceId || '',
      preferred_date: initialDate || '',
    }))
  }, [initialDate, initialServiceId, isOpen])

  if (!isOpen) return null

  const submit = async () => {
    if (!locationId || !form.customer_name.trim() || !form.customer_phone.trim()) {
      toast.error('Customer name and phone are required for the waitlist')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/bookings/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          location_id: locationId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to add to waitlist')
        return
      }
      toast.success('Added to waitlist')
      await onCreated()
      onClose()
      setForm({
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        service_id: initialServiceId || '',
        preferred_date: initialDate || '',
        preferred_time_start: '',
        preferred_time_end: '',
        person_count: 1,
        notes: '',
        source: BookingSource.PORTAL,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-xl rounded-3xl border border-white/60 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Add to waitlist</h2>
            <p className="mt-1 text-sm text-slate-600">Keep the customer in queue when no appointment slot fits.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600">Close</button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            Customer name
            <input value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Phone
            <input value={form.customer_phone} onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Email
            <input value={form.customer_email} onChange={(e) => setForm((p) => ({ ...p, customer_email: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Service
            <select value={form.service_id} onChange={(e) => setForm((p) => ({ ...p, service_id: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              <option value="">Any service</option>
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Preferred date
            <input type="date" value={form.preferred_date} onChange={(e) => setForm((p) => ({ ...p, preferred_date: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            People
            <input type="number" min={1} value={form.person_count} onChange={(e) => setForm((p) => ({ ...p, person_count: Math.max(1, Number(e.target.value) || 1) }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Preferred start
            <input type="time" value={form.preferred_time_start} onChange={(e) => setForm((p) => ({ ...p, preferred_time_start: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            Preferred end
            <input type="time" value={form.preferred_time_end} onChange={(e) => setForm((p) => ({ ...p, preferred_time_end: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">
            Notes
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Add to waitlist'}
          </button>
        </div>
      </div>
    </div>
  )
}
