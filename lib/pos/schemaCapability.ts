export const POS_CAPABILITY_VERSION = 2026090902

export type PosSchemaStatus = { ready: boolean; version: number }

export function normalizePosSchemaStatus(value: unknown): PosSchemaStatus | null {
  const candidate = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const status = candidate as Record<string, unknown>
  const version = Number(status.version)
  if (typeof status.ready !== 'boolean' || !Number.isSafeInteger(version) || version < 0)
    return null
  return { ready: status.ready, version }
}

export function hasPosSchemaCapability(value: unknown, minimumVersion = POS_CAPABILITY_VERSION) {
  const status = normalizePosSchemaStatus(value)
  return Boolean(status?.ready && status.version >= minimumVersion)
}
