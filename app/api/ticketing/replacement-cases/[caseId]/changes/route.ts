import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingAppendReplacementChangeSchema } from '@/lib/ticketing/replacementCaseContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const { caseId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(caseId)) return apiError('Invalid case.', 400)
  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.replacement-change',
    limit: 50,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key || key.length > 200) return apiError('A valid save key is required.', 400)
  const { data: input, error } = await parseBodyWithSchema(
    request,
    ticketingAppendReplacementChangeSchema,
    { maxBytes: 16 * 1024 },
  )
  if (!input || error) return apiError(error || 'Review the later-change details.', 400)
  const { data, error: rpcError } = await getServiceSupabaseClient().rpc(
    'ticketing_append_replacement_change_2026092601',
    {
      p_actor_employee_id: access.employee.id,
      p_case_id: caseId,
      p_idempotency_key: key,
      p_entry: input,
    },
  )
  if (rpcError) {
    if (rpcError.hint === 'TICKETING_REPLACEMENT_VERSION_CONFLICT') {
      return apiError('This case changed. Refresh it and try again.', 409)
    }
    if (rpcError.hint === 'TICKETING_IDEMPOTENCY_CONFLICT') {
      return apiError('This save key was already used for different change details.', 409)
    }
    if (rpcError.code === '23505') return apiError('That new ticket is already linked.', 409)
    if (rpcError.code === '42501') return apiError(rpcError.message || 'Forbidden', 403)
    if (['22023', 'P0002', '55000'].includes(String(rpcError.code || ''))) {
      return apiError(rpcError.message || 'Review the later-change details.', 400)
    }
    return apiError('Unable to save the later change right now.', 500)
  }
  return apiOk(data, { status: data?.idempotentReplay ? 200 : 201, ...PRIVATE_RESPONSE })
}
