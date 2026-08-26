export type TicketingSchemaStatus = {
  ready: boolean
  version: number
}

export function normalizeTicketingSchemaStatus(value: unknown): TicketingSchemaStatus | null {
  const candidate = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null

  const status = candidate as Record<string, unknown>
  if (typeof status.ready !== 'boolean') return null
  if (
    (typeof status.version !== 'number' && typeof status.version !== 'string') ||
    (typeof status.version === 'string' && !status.version.trim())
  ) {
    return null
  }

  const version = Number(status.version)
  if (!Number.isSafeInteger(version) || version < 0) return null

  return { ready: status.ready, version }
}

export function hasTicketingSchemaCapability(value: unknown, minimumVersion: number) {
  const status = normalizeTicketingSchemaStatus(value)
  return Boolean(status?.ready && status.version >= minimumVersion)
}
