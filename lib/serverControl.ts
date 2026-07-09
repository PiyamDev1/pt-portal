/**
 * Hetzner Cloud server-control helpers.
 *
 * The app only exposes a small allowlist of power actions. Credentials stay
 * server-side and are read from environment variables.
 */

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1'
const SERVICE_HEALTH_TIMEOUT_MS = 5000

export type ServerControlAction = 'start' | 'stop' | 'restart'
export type ServiceHealthStatus = 'unknown' | 'online' | 'degraded' | 'offline'

type HetznerServerPayload = {
  id: number
  name: string
  status: string
  created?: string | null
  public_net?: {
    ipv4?: { ip?: string | null } | null
    ipv6?: { ip?: string | null } | null
  } | null
  datacenter?: {
    name?: string | null
    location?: { name?: string | null } | null
  } | null
  server_type?: { name?: string | null } | null
  image?: { name?: string | null; description?: string | null } | null
}

type HetznerActionPayload = {
  id: number
  command: string
  status: string
  progress: number
  started: string
  finished: string | null
}

type HetznerErrorPayload = {
  error?: {
    code?: string
    message?: string
  }
}

export type ServerControlStatusPayload = {
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

export type ServerControlActionResult = {
  ok: true
  action: ServerControlAction
  providerAction: {
    id: number
    command: string
    status: string
    progress: number
    started: string
    finished: string | null
  }
}

export function getServerControlConfig() {
  const token = process.env.HETZNER_API_TOKEN?.trim() || ''
  const serverId = process.env.HETZNER_SERVER_ID?.trim() || ''
  const serverIps = (process.env.HETZNER_SERVER_IP || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const label = process.env.HETZNER_SERVER_LABEL?.trim() || 'Hetzner production server'

  return {
    configured: Boolean(token && (serverId || serverIps.length > 0)),
    token,
    serverId,
    serverIps,
    label,
  }
}

type ServiceDefinition = {
  name: string
  description: string
  healthUrl: string | null
}

function getDefaultServiceDefinitions(): ServiceDefinition[] {
  return [
    { name: 'Coolify', description: 'Deployment control panel', healthUrl: null },
    { name: 'Chatwoot', description: 'Customer communication workspace', healthUrl: null },
    { name: 'Evolution Manager', description: 'WhatsApp integration manager', healthUrl: null },
  ]
}

function parseServiceEntry(value: string): ServiceDefinition | null {
  const entry = value.trim()
  if (!entry) return null

  const separatorIndex = entry.indexOf('=')
  if (separatorIndex === -1) {
    return {
      name: entry,
      description: 'Hosted on this server',
      healthUrl: null,
    }
  }

  const name = entry.slice(0, separatorIndex).trim()
  const healthUrl = entry.slice(separatorIndex + 1).trim()
  if (!name) return null

  return {
    name,
    description: 'Hosted on this server',
    healthUrl: normalizeHealthUrl(healthUrl),
  }
}

function parseHealthUrlOverrides() {
  const configured = process.env.SERVER_CONTROL_SERVICE_HEALTH_URLS?.trim()
  const overrides = new Map<string, string>()

  if (!configured) return overrides

  for (const entry of configured.split(',')) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex === -1) continue

    const name = entry.slice(0, separatorIndex).trim()
    const healthUrl = normalizeHealthUrl(entry.slice(separatorIndex + 1).trim())
    if (name && healthUrl) {
      overrides.set(name.toLowerCase(), healthUrl)
    }
  }

  return overrides
}

export function getConfiguredServiceDefinitions() {
  const configured = process.env.SERVER_CONTROL_SERVICES?.trim()
  const services = configured
    ? configured
        .split(',')
        .map(parseServiceEntry)
        .filter((service): service is ServiceDefinition => Boolean(service))
    : getDefaultServiceDefinitions()
  const healthUrlOverrides = parseHealthUrlOverrides()

  return services.map((service) => ({
    ...service,
    healthUrl: healthUrlOverrides.get(service.name.toLowerCase()) || service.healthUrl,
  }))
}

function toPublicHealthHost(healthUrl: string | null) {
  if (!healthUrl) return null

  try {
    return new URL(healthUrl).host
  } catch {
    return null
  }
}

function normalizeHealthUrl(value: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).toString()
  } catch {}

  const fallbackScheme = /^(\d{1,3}\.){3}\d{1,3}:\d+/.test(trimmed) ? 'http' : 'https'
  try {
    return new URL(`${fallbackScheme}://${trimmed}`).toString()
  } catch {
    return null
  }
}

function toServiceStatus(statusCode: number): ServiceHealthStatus {
  if (statusCode >= 200 && statusCode < 400) return 'online'
  return 'degraded'
}

function toServiceError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Health check timed out'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Health check failed'
}

async function probeServiceHealth(service: ServiceDefinition) {
  if (!service.healthUrl) {
    return {
      name: service.name,
      description: service.description,
      healthUrlConfigured: false,
      healthUrlHost: null,
      status: 'unknown' as ServiceHealthStatus,
      statusCode: null,
      responseMs: null,
      checkedAt: null,
      error: null,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVICE_HEALTH_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(service.healthUrl, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })

    return {
      name: service.name,
      description: service.description,
      healthUrlConfigured: true,
      healthUrlHost: toPublicHealthHost(service.healthUrl),
      status: toServiceStatus(response.status),
      statusCode: response.status,
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: null,
    }
  } catch (error) {
    return {
      name: service.name,
      description: service.description,
      healthUrlConfigured: true,
      healthUrlHost: toPublicHealthHost(service.healthUrl),
      status: 'offline' as ServiceHealthStatus,
      statusCode: null,
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: toServiceError(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getConfiguredServiceStatuses() {
  const services = getConfiguredServiceDefinitions()
  return Promise.all(services.map((service) => probeServiceHealth(service)))
}

function getActionEndpoint(action: ServerControlAction) {
  const endpoints: Record<ServerControlAction, string> = {
    start: 'poweron',
    stop: 'shutdown',
    restart: 'reboot',
  }

  return endpoints[action]
}

function toHetznerError(data: unknown, fallback: string) {
  const payload = data as HetznerErrorPayload
  return payload?.error?.message || fallback
}

async function hetznerFetch<T>(path: string, init: RequestInit = {}) {
  const config = getServerControlConfig()
  if (!config.token) {
    throw new Error('Hetzner API token is not configured')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${config.token}`)
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${HETZNER_API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = (await response.json().catch(() => ({}))) as T | HetznerErrorPayload

  if (!response.ok) {
    throw new Error(toHetznerError(payload, `Hetzner API request failed (${response.status})`))
  }

  return payload as T
}

async function listHetznerServersByPage() {
  const servers: HetznerServerPayload[] = []
  let page = 1
  let nextPage: number | null = 1

  while (nextPage) {
    const payload = await hetznerFetch<{
      servers: HetznerServerPayload[]
      meta?: { pagination?: { next_page?: number | null } }
    }>(`/servers?page=${page}&per_page=50`)

    servers.push(...(payload.servers || []))
    nextPage = payload.meta?.pagination?.next_page || null
    page = nextPage || page
  }

  return servers
}

async function getConfiguredHetznerServer() {
  const config = getServerControlConfig()
  if (!config.configured) {
    throw new Error('Server control is not configured')
  }

  if (config.serverId) {
    const payload = await hetznerFetch<{ server: HetznerServerPayload }>(
      `/servers/${encodeURIComponent(config.serverId)}`,
    )
    return payload.server
  }

  const servers = await listHetznerServersByPage()
  const server = servers.find(
    (item) =>
      config.serverIps.includes(item.public_net?.ipv4?.ip || '') ||
      config.serverIps.includes(item.public_net?.ipv6?.ip || ''),
  )

  if (!server) {
    throw new Error(`No Hetzner server found for IP ${config.serverIps.join(', ')}`)
  }

  return server
}

function normalizeServer(server: HetznerServerPayload): ServerControlStatusPayload['server'] {
  return {
    id: server.id,
    name: server.name,
    status: server.status,
    created: server.created || null,
    primaryIpv4: server.public_net?.ipv4?.ip || null,
    primaryIpv6: server.public_net?.ipv6?.ip || null,
    datacenter: server.datacenter?.name || null,
    location: server.datacenter?.location?.name || null,
    serverType: server.server_type?.name || null,
    image: server.image?.description || server.image?.name || null,
  }
}

export async function getServerControlStatus(): Promise<ServerControlStatusPayload> {
  const config = getServerControlConfig()
  const services = await getConfiguredServiceStatuses()
  const basePayload = {
    configured: config.configured,
    label: config.label,
    checkedAt: new Date().toISOString(),
    services,
  }

  if (!config.configured) {
    return {
      ...basePayload,
      server: null,
    }
  }

  const server = await getConfiguredHetznerServer()

  return {
    ...basePayload,
    server: normalizeServer(server),
  }
}

export async function runServerControlAction(
  action: ServerControlAction,
): Promise<ServerControlActionResult> {
  const config = getServerControlConfig()
  if (!config.configured) {
    throw new Error('Server control is not configured')
  }

  const providerAction = getActionEndpoint(action)
  const serverId = config.serverId || String((await getConfiguredHetznerServer()).id)
  const payload = await hetznerFetch<{ action: HetznerActionPayload }>(
    `/servers/${encodeURIComponent(serverId)}/actions/${providerAction}`,
    { method: 'POST' },
  )

  return {
    ok: true,
    action,
    providerAction: {
      id: payload.action.id,
      command: payload.action.command,
      status: payload.action.status,
      progress: payload.action.progress,
      started: payload.action.started,
      finished: payload.action.finished,
    },
  }
}
