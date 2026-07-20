'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Pencil, Plus, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'

type Location = { id: string; name: string }

type TimeclockDevice = {
  id: string
  name: string
  location: string | null
  location_id: string | null
  qr_interval_sec: number
  is_active: boolean
  last_seen_at: string | null
  firmware_version: string | null
  ip: string | null
  wifi_rssi: number | null
  free_heap: number | null
  uptime_sec: number | null
  online: boolean
}

type DeviceForm = {
  name: string
  location_id: string
  qr_interval_sec: number
  is_active: boolean
}

const API_URL = '/api/admin/timeclock/devices'
const EMPTY_FORM: DeviceForm = {
  name: '',
  location_id: '',
  qr_interval_sec: 30,
  is_active: true,
}

function formatLastSeen(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

function formatUptime(seconds: number | null) {
  if (seconds === null) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function TimeclockDevicesTab({ locations }: { locations: Location[] }) {
  const [devices, setDevices] = useState<TimeclockDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<TimeclockDevice | null | 'new'>(null)
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM)
  const [rotating, setRotating] = useState<TimeclockDevice | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [provisioning, setProvisioning] = useState<{
    deviceId: string
    secret: string
  } | null>(null)
  const [copied, setCopied] = useState<'id' | 'secret' | null>(null)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(API_URL, { cache: 'no-store' })
      const payload = (await response.json()) as { devices?: TimeclockDevice[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Failed to load devices')
      setDevices(payload.devices || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  const openEdit = (device: TimeclockDevice) => {
    setForm({
      name: device.name,
      location_id: device.location_id || '',
      qr_interval_sec: device.qr_interval_sec,
      is_active: device.is_active,
    })
    setEditing(device)
  }

  const saveDevice = async () => {
    if (!form.name.trim()) {
      toast.error('Enter a device name')
      return
    }

    setSaving(true)
    try {
      const isNew = editing === 'new'
      const response = await fetch(API_URL, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          location_id: form.location_id || null,
          ...(!isNew && editing ? { id: editing.id } : {}),
        }),
      })
      const payload = (await response.json()) as {
        device?: TimeclockDevice
        provisioning_secret?: string
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || 'Failed to save device')

      setEditing(null)
      await loadDevices()
      if (isNew && payload.device && payload.provisioning_secret) {
        setProvisioning({ deviceId: payload.device.id, secret: payload.provisioning_secret })
      }
      toast.success(isNew ? 'Timeclock device created' : 'Timeclock device updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save device')
    } finally {
      setSaving(false)
    }
  }

  const rotateSecret = async () => {
    if (!rotating) return
    setSaving(true)
    try {
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rotating.id,
          action: 'rotate_secret',
          confirmation,
        }),
      })
      const payload = (await response.json()) as {
        provisioning_secret?: string
        error?: string
      }
      if (!response.ok || !payload.provisioning_secret) {
        throw new Error(payload.error || 'Failed to rotate secret')
      }

      setRotating(null)
      setConfirmation('')
      setProvisioning({ deviceId: rotating.id, secret: payload.provisioning_secret })
      toast.success('Device secret rotated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rotate secret')
    } finally {
      setSaving(false)
    }
  }

  const copyValue = async (kind: 'id' | 'secret', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Physical Timeclock Devices</h2>
          <p className="mt-1 text-sm text-slate-600">ESP32 units assigned to Portal locations.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadDevices()}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh devices"
            title="Refresh devices"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded bg-[#8b1e2d] px-4 py-2 text-sm font-medium text-white hover:bg-[#741824]"
          >
            <Plus className="h-4 w-4" />
            Add device
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Firmware</th>
                <th className="px-4 py-3">Network</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((device) => (
                <tr key={device.id} className="text-slate-700">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                        device.online
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {device.online ? (
                        <Wifi className="h-3.5 w-3.5" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5" />
                      )}
                      {device.online ? 'Online' : device.is_active ? 'Offline' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{device.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{device.id}</p>
                  </td>
                  <td className="px-4 py-3">{device.location || 'Unassigned'}</td>
                  <td className="px-4 py-3">{device.firmware_version || '-'}</td>
                  <td className="px-4 py-3">
                    <p>{device.ip || '-'}</p>
                    <p className="text-xs text-slate-500">
                      {device.wifi_rssi === null ? 'RSSI -' : `RSSI ${device.wifi_rssi} dBm`} /{' '}
                      {formatUptime(device.uptime_sec)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatLastSeen(device.last_seen_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(device)}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        aria-label={`Edit ${device.name}`}
                        title="Edit device"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRotating(device)
                          setConfirmation('')
                        }}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        aria-label={`Rotate secret for ${device.name}`}
                        title="Rotate secret"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && devices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No physical timeclock devices configured.
                  </td>
                </tr>
              )}
              {loading && devices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    Loading devices...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add Timeclock Device' : 'Edit Timeclock Device'}
          onClose={() => setEditing(null)}
        >
          <div className="space-y-4 p-5">
            <label className="block text-sm font-medium text-slate-700">
              Device name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                maxLength={120}
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-[#8b1e2d] focus:ring-1 focus:ring-[#8b1e2d]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Location
              <select
                value={form.location_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location_id: event.target.value }))
                }
                className="mt-1.5 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-[#8b1e2d] focus:ring-1 focus:ring-[#8b1e2d]"
              >
                <option value="">Unassigned</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              QR refresh interval (seconds)
              <input
                type="number"
                min={5}
                max={300}
                value={form.qr_interval_sec}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    qr_interval_sec: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-[#8b1e2d] focus:ring-1 focus:ring-[#8b1e2d]"
              />
            </label>
            {editing !== 'new' && (
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, is_active: event.target.checked }))
                  }
                  className="h-4 w-4 accent-[#8b1e2d]"
                />
                Device active
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveDevice()}
              disabled={saving}
              className="rounded bg-[#8b1e2d] px-4 py-2 text-sm font-medium text-white hover:bg-[#741824] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save device'}
            </button>
          </div>
        </Modal>
      )}

      {rotating && (
        <Modal title="Rotate Device Secret" onClose={() => setRotating(null)}>
          <div className="space-y-4 p-5 text-sm text-slate-700">
            <p>The current firmware secret will stop working immediately.</p>
            <label className="block font-medium">
              Type <span className="font-semibold text-slate-950">{rotating.name}</span> to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-[#8b1e2d] focus:ring-1 focus:ring-[#8b1e2d]"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={() => setRotating(null)}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void rotateSecret()}
              disabled={saving || confirmation !== rotating.name}
              className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {saving ? 'Rotating...' : 'Rotate secret'}
            </button>
          </div>
        </Modal>
      )}

      {provisioning && (
        <Modal title="Provisioning Credentials" onClose={() => setProvisioning(null)}>
          <div className="space-y-4 p-5">
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This secret is shown once. Put it in the firmware&apos;s ignored local environment
              file before closing.
            </p>
            {(
              [
                ['id', 'Device ID', provisioning.deviceId],
                ['secret', 'Device secret', provisioning.secret],
              ] as const
            ).map(([kind, label, value]) => (
              <div key={kind}>
                <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                <div className="mt-1 flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-3">
                  <code className="min-w-0 flex-1 break-all text-xs text-slate-900">{value}</code>
                  <button
                    type="button"
                    onClick={() => void copyValue(kind, value)}
                    className="rounded p-1 text-slate-600 hover:bg-slate-200"
                    aria-label={`Copy ${label}`}
                    title={`Copy ${label}`}
                  >
                    {copied === kind ? (
                      <Check className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={() => setProvisioning(null)}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
