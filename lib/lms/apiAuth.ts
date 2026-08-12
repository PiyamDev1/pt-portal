import { apiError } from '@/lib/api/http'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import {
  ADMIN_ROLES,
  MAINTENANCE_ROLES,
  requireStaffSession,
  type StaffSession,
} from '@/lib/auth/staffSession'

export type LmsAccess = { authorized: true } & StaffSession

export async function requireLmsStaff(): Promise<
  LmsAccess | { authorized: false; response: Response }
> {
  return requireStaffSession()
}

export async function requireLmsAdmin(): Promise<
  LmsAccess | { authorized: false; response: Response }
> {
  return requireStaffSession({ roles: [...ADMIN_ROLES] })
}

export async function requireLmsMaintenance(): Promise<
  LmsAccess | { authorized: false; response: Response }
> {
  return requireStaffSession({ roles: [...MAINTENANCE_ROLES] })
}

export async function verifyLmsDestructiveAction(
  access: LmsAccess,
  input: { verificationCode?: unknown; verificationMethod?: unknown },
) {
  const result = await verifyFreshSecondFactor({
    userId: access.user.id,
    code: input.verificationCode,
    method: input.verificationMethod,
  })

  return result.verified ? null : apiError(result.error, 403)
}

export function getLmsIdempotencyKey(request: Request, body?: Record<string, unknown> | null) {
  const headerKey = request.headers.get('idempotency-key')?.trim()
  const bodyKey = String(body?.idempotencyKey || body?.idempotency_key || '').trim()
  const key = headerKey || bodyKey
  return key ? key.slice(0, 200) : null
}
