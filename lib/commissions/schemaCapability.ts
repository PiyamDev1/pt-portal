export type CommissionSchemaStatus = {
  ready: boolean
  version: number
  mode: 'shadow'
}

export function normalizeCommissionSchemaStatus(value: unknown): CommissionSchemaStatus | null {
  const candidate = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null

  const status = candidate as Record<string, unknown>
  const version = Number(status.version)
  if (
    typeof status.ready !== 'boolean' ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    status.mode !== 'shadow'
  ) {
    return null
  }
  return { ready: status.ready, version, mode: 'shadow' }
}

export function hasCommissionSchemaCapability(value: unknown, minimumVersion: number) {
  const status = normalizeCommissionSchemaStatus(value)
  return Boolean(status?.ready && status.version >= minimumVersion && status.mode === 'shadow')
}
