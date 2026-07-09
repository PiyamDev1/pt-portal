/**
 * Super Admin server-control panel.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Cloud,
  Play,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { API_ENDPOINTS } from '@/lib/constants/api'

type ServerAction = 'start' | 'stop' | 'restart'
type VerificationMethod = 'totp' | 'backup'
type ServiceHealthStatus = 'unknown' | 'online' | 'degraded' | 'offline'

type ServerControlStatus = {
  configured: boolean
  label: string
  checkedAt: string
  server: {
    id: number
    name: string
    status: string
    created: string | null
    primaryIpv4: string | null
    primaryIpv6: string | null
    datacenter: string | null
    location: string | null
    serverType: string | null
    image: string | null
  } | null
  services: Array<{
    name: string
    description: string
    healthUrlConfigured: boolean
    healthUrlHost: string | null
    status: ServiceHealthStatus
    statusCode: number | null
    responseMs: number | null
    checkedAt: string | null
    error: string | null
  }>
}

type ServerControlActionResponse = {
  ok: true
  action: ServerAction
  providerAction: {
    id: number
    command: string
    status: string
  }
}

const ACTION_COPY: Record<
  ServerAction,
  {
    label: string
    verb: string
    description: string
    icon: typeof Play
    type: 'success' | 'warning' | 'danger'
    buttonClass: string
  }
> = {
  start: {
    label: 'Start',
    verb: 'start',
    description: 'Power on the Hetzner server.',
    icon: Play,
    type: 'success',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  restart: {
    label: 'Restart',
    verb: 'restart',
    description: 'Gracefully reboot the running server.',
    icon: RotateCw,
    type: 'warning',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  stop: {
    label: 'Stop',
    verb: 'stop',
    description: 'Send a graceful shutdown request to the server.',
    icon: Square,
    type: 'danger',
    buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function getStatusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'running') return 'bg-emerald-100 text-emerald-700'
  if (['off', 'stopping'].includes(normalized)) return 'bg-slate-100 text-slate-700'
  if (['starting', 'initializing', 'migrating', 'rebuilding'].includes(normalized)) {
    return 'bg-amber-100 text-amber-700'
  }
  return 'bg-red-100 text-red-700'
}

function getServiceTone(status: ServiceHealthStatus) {
  if (status === 'online') return 'bg-emerald-100 text-emerald-700'
  if (status === 'degraded') return 'bg-amber-100 text-amber-700'
  if (status === 'offline') return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-700'
}

function getServiceLabel(status: ServiceHealthStatus) {
  if (status === 'unknown') return 'No probe'
  return status
}

function canRunAction(action: ServerAction, status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (action === 'start') return normalized === 'off'
  if (action === 'restart') return normalized === 'running'
  if (action === 'stop') return normalized === 'running'
  return false
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value || '-'}</p>
    </div>
  )
}

export function ServerControlTab() {
  const [status, setStatus] = useState<ServerControlStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<ServerAction | null>(null)
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('totp')
  const [verificationCode, setVerificationCode] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(API_ENDPOINTS.ADMIN_SERVER_CONTROL, { cache: 'no-store' })
      const payload = (await response.json()) as ServerControlStatus & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load server status')
      }
      setStatus(payload)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load server status'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const serverStatus = status?.server?.status || 'unknown'
  const actionCopy = pendingAction ? ACTION_COPY[pendingAction] : null
  const confirmTitle = actionCopy ? `${actionCopy.label} Server` : 'Confirm Server Action'
  const canControl = Boolean(status?.configured && status.server)

  const openAction = (action: ServerAction) => {
    setPendingAction(action)
    setVerificationMethod('totp')
    setVerificationCode('')
  }

  const closeAction = () => {
    if (actionLoading) return
    setPendingAction(null)
    setVerificationCode('')
  }

  const runAction = async () => {
    if (!pendingAction) return
    if (!verificationCode.trim()) {
      toast.error('Enter your 2FA code first')
      throw new Error('Verification code required')
    }

    setActionLoading(true)
    try {
      const response = await fetch(API_ENDPOINTS.ADMIN_SERVER_CONTROL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: pendingAction,
          verificationMethod,
          verificationCode,
        }),
      })
      const payload = (await response.json()) as ServerControlActionResponse & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Server action failed')
      }

      toast.success(`${ACTION_COPY[pendingAction].label} requested`, {
        description: `Hetzner action ${payload.providerAction.id} is ${payload.providerAction.status}.`,
      })
      setPendingAction(null)
      setVerificationCode('')
      await loadStatus()
      window.setTimeout(() => void loadStatus(), 5000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Server action failed'
      toast.error(message)
      throw err
    } finally {
      setActionLoading(false)
    }
  }

  const statusIcon = useMemo(() => {
    if (serverStatus === 'running') return CheckCircle2
    if (serverStatus === 'off') return CircleOff
    return AlertTriangle
  }, [serverStatus])
  const StatusIcon = statusIcon

  if (loading && !status) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading server status...
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6" data-testid="server-control-tab">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Server className="h-4 w-4 text-[#8b1e2d]" />
                Super Admin only
              </div>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Server Control</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Monitor the Hetzner host that runs Coolify, Chatwoot, and Evolution Manager. Power
                actions require a fresh authenticator or backup-code check. Service probes are
                optional and configured with server-side URLs.
              </p>
            </div>
            <button
              onClick={() => void loadStatus()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              type="button"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {status && !status.configured && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5" />
              <div>
                <h3 className="font-bold">Server control is not configured</h3>
                <p className="mt-1 text-sm">
                  Add `HETZNER_API_TOKEN` plus `HETZNER_SERVER_ID` or `HETZNER_SERVER_IP` to the
                  server environment to enable status and power actions.
                </p>
              </div>
            </div>
          </section>
        )}

        {status?.server && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {status.label}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900">{status.server.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Last checked {formatDateTime(status.checkedAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${getStatusTone(
                    status.server.status,
                  )}`}
                >
                  <StatusIcon className="h-4 w-4" />
                  {status.server.status}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DetailRow label="Primary IPv4" value={status.server.primaryIpv4} />
                <DetailRow label="Datacenter" value={status.server.datacenter} />
                <DetailRow label="Location" value={status.server.location} />
                <DetailRow label="Server Type" value={status.server.serverType} />
                <DetailRow label="Image" value={status.server.image} />
                <DetailRow label="Created" value={formatDateTime(status.server.created)} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-slate-500" />
                <h3 className="text-lg font-bold text-slate-900">Hosted Services</h3>
              </div>
              <div className="mt-4 space-y-3">
                {status.services.map((service) => (
                  <div
                    key={service.name}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{service.name}</p>
                        <p className="text-xs text-slate-500">{service.description}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${getServiceTone(
                          service.status,
                        )}`}
                      >
                        {getServiceLabel(service.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {service.healthUrlConfigured ? (
                        <>
                          <p>{service.healthUrlHost || 'Configured health URL'}</p>
                          <p>
                            {service.statusCode ? `HTTP ${service.statusCode}` : 'No HTTP status'}
                            {service.responseMs != null ? ` in ${service.responseMs}ms` : ''}
                          </p>
                          {service.error && <p className="text-red-600">{service.error}</p>}
                        </>
                      ) : (
                        <p>Probe not configured. Host is {serverStatus}.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#8b1e2d]" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">Power Actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Start, stop, and restart are protected by Super Admin access plus a fresh 2FA check.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(Object.keys(ACTION_COPY) as ServerAction[]).map((action) => {
                  const copy = ACTION_COPY[action]
                  const Icon = copy.icon
                  const disabled =
                    !canControl ||
                    actionLoading ||
                    loading ||
                    !canRunAction(action, status?.server?.status)

                  return (
                    <button
                      key={action}
                      onClick={() => openAction(action)}
                      disabled={disabled}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${copy.buttonClass}`}
                      type="button"
                    >
                      <Icon className="h-4 w-4" />
                      {copy.label}
                    </button>
                  )
                })}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Stop uses Hetzner&apos;s graceful shutdown action. If the server is unresponsive,
                use the Hetzner console for emergency force-off.
              </p>
            </div>
          </div>
        </section>
      </div>

      <ConfirmationDialog
        isOpen={!!pendingAction}
        onClose={closeAction}
        onConfirm={runAction}
        title={confirmTitle}
        message={
          actionCopy
            ? `Confirm your identity to ${actionCopy.verb} ${status?.server?.name || 'the server'}.`
            : 'Confirm this server action.'
        }
        confirmLabel={actionCopy ? actionCopy.label : 'Confirm'}
        cancelLabel="Cancel"
        type={actionCopy?.type || 'warning'}
        isLoading={actionLoading}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVerificationMethod('totp')}
              disabled={actionLoading}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                verificationMethod === 'totp'
                  ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Authenticator
            </button>
            <button
              type="button"
              onClick={() => setVerificationMethod('backup')}
              disabled={actionLoading}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                verificationMethod === 'backup'
                  ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Backup code
            </button>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            {verificationMethod === 'totp' ? 'Authenticator code' : 'Single-use backup code'}
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              inputMode={verificationMethod === 'totp' ? 'numeric' : 'text'}
              autoComplete="one-time-code"
              maxLength={verificationMethod === 'totp' ? 6 : 32}
              disabled={actionLoading}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100 disabled:bg-slate-100"
              placeholder={verificationMethod === 'totp' ? '000000' : 'Backup code'}
            />
          </label>
          {verificationMethod === 'backup' && (
            <p className="text-xs text-amber-700">
              Backup codes are one-time use and will be consumed after verification.
            </p>
          )}
        </div>
      </ConfirmationDialog>
    </>
  )
}
