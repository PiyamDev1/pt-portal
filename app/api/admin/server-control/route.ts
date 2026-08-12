/**
 * GET/POST /api/admin/server-control
 *
 * Super Admin only. GET reads Hetzner server status. POST runs a whitelisted
 * server power action after a fresh TOTP or backup-code verification.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  getServerControlConfig,
  getServerControlStatus,
  runServerControlAction,
} from '@/lib/serverControl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const serverActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart'], { error: 'Invalid server action' }),
  verificationCode: z.string().trim().min(1, 'Verification code required'),
  verificationMethod: z.enum(['totp', 'backup'], { error: 'Invalid verification method' }),
})

export async function GET() {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  try {
    const status = await getServerControlStatus()
    return apiOk(status)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load server status'), 502)
  }
}

export async function POST(request: Request) {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.server-control',
    limit: 5,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, serverActionSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

  const config = getServerControlConfig()
  if (!config.configured) {
    return apiError('Server control is not configured', 503)
  }

  const verification = await verifyFreshSecondFactor({
    userId: access.user.id,
    method: body.verificationMethod,
    code: body.verificationCode,
  })

  if (!verification.verified) {
    console.warn('[server-control] Power action verification failed', {
      userId: access.user.id,
      action: body.action,
      method: body.verificationMethod,
    })
    return apiError(verification.error || 'Verification failed', 403)
  }

  try {
    const result = await runServerControlAction(body.action)
    return apiOk(result)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to run server action'), 502)
  }
}
