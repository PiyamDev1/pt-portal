import { createHash } from 'node:crypto'

type CommissionCursor = { createdAt: string; id: string; filterHash: string }

function hashFilters(filters: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(filters)).digest('hex').slice(0, 24)
}

export function encodeCommissionCursor(
  row: { created_at: string; id: string },
  filters: Record<string, unknown>,
) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.created_at, id: row.id, filterHash: hashFilters(filters) }),
  ).toString('base64url')
}

export function decodeCommissionCursor(
  value: string | null,
  filters: Record<string, unknown>,
): CommissionCursor | null | 'invalid' {
  if (!value) return null
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    if (
      typeof decoded.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        decoded.id,
      ) ||
      decoded.filterHash !== hashFilters(filters)
    ) {
      return 'invalid'
    }
    return {
      createdAt: decoded.createdAt,
      id: decoded.id,
      filterHash: decoded.filterHash as string,
    }
  } catch {
    return 'invalid'
  }
}
