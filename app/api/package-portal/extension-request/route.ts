import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { normalizePackagePortalReference } from '@/lib/packagePortal'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/
const OPEN_REQUEST_STATUSES = ['open', 'in_progress', 'blocked']
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const requestSchema = z
  .object({
    reference: z.string().max(32).optional(),
    lastName: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
  })
  .strict()

function cleanBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer[ \t]+([^ \t]+)$/i)
  const token = match?.[1]?.trim() || ''
  return TOKEN_PATTERN.test(token) ? token : ''
}

function normalizeLastName(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}'-]/gu, '')
    : ''
}

function namesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function requestIdentity(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function POST(request: NextRequest) {
  const { data: body, error: bodyError } = await parseBodyWithSchema(request, requestSchema, {
    maxBytes: 2 * 1024,
  })
  if (bodyError || !body) {
    return apiError(bodyError || 'Invalid request', 400, {}, { headers: NO_STORE_HEADERS })
  }
  const token = cleanBearerToken(request)
  const reference = normalizePackagePortalReference(body.reference)
  const lastName = normalizeLastName(body.lastName || body.last_name)
  const usesReferenceAccess = Boolean(reference && lastName)

  if (!token && !usesReferenceAccess) {
    return apiError(
      'A valid package credential is required',
      400,
      {},
      { headers: NO_STORE_HEADERS },
    )
  }

  const credentialIdentity = token
    ? `token:${requestIdentity(token)}`
    : `reference:${requestIdentity(`${reference}:${lastName}`)}`
  const limit = await enforceRateLimit(request, {
    scope: 'public.package-portal-extension-request',
    limit: 5,
    windowSeconds: 60 * 60,
    identities: [`ip:${getClientIp(request)}`, credentialIdentity],
  })
  if (!limit.allowed) return limit.response

  const supabase = getServiceSupabaseClient()
  let packageQuery = supabase
    .from('travel_packages')
    .select(
      'id, package_reference, customer_name, customer_access_last_name, document_access_token, document_access_enabled, document_access_expires_at',
    )

  packageQuery = token
    ? packageQuery.eq('document_access_token', token)
    : packageQuery.ilike('package_reference', reference as string)

  const { data: packageData, error: packageError } = await packageQuery.maybeSingle()
  if (packageError || !packageData) {
    return apiError('Package details do not match', 404, {}, { headers: NO_STORE_HEADERS })
  }

  if (usesReferenceAccess && !token) {
    const storedLastName = normalizeLastName(
      packageData.customer_access_last_name ||
        String(packageData.customer_name || '')
          .trim()
          .split(/\s+/)
          .at(-1),
    )
    if (!namesMatch(storedLastName, lastName)) {
      return apiError('Package details do not match', 404, {}, { headers: NO_STORE_HEADERS })
    }
  }

  const { data: existingRequest, error: existingRequestError } = await supabase
    .from('travel_package_tasks')
    .select('id, status')
    .eq('package_id', packageData.id)
    .eq('task_type', 'portal_access_extension')
    .in('status', OPEN_REQUEST_STATUSES)
    .limit(1)
    .maybeSingle()

  if (existingRequestError) {
    return apiError(
      'Unable to submit the extension request',
      503,
      {},
      { headers: NO_STORE_HEADERS },
    )
  }
  if (existingRequest) {
    return apiOk(
      { requested: true, alreadyRequested: true },
      { status: 202, headers: NO_STORE_HEADERS },
    )
  }

  const requestedAt = new Date().toISOString()
  const { data: task, error: taskError } = await supabase
    .from('travel_package_tasks')
    .insert({
      package_id: packageData.id,
      title: 'Customer requested document portal access extension',
      description: packageData.document_access_expires_at
        ? `Customer requested staff review of portal access currently expiring ${packageData.document_access_expires_at}.`
        : 'Customer requested staff review of document portal access.',
      task_type: 'portal_access_extension',
      status: 'open',
      priority: 'medium',
      assigned_to: null,
      auto_generated: true,
      source_rule: 'customer_portal_extension_request',
      metadata: {
        requested_at: requestedAt,
        source: 'bookings_portal',
        access_was_enabled: packageData.document_access_enabled === true,
        previous_access_expiry: packageData.document_access_expires_at || null,
      },
    })
    .select('id')
    .single()

  if (taskError || !task) {
    return apiError(
      'Unable to submit the extension request',
      503,
      {},
      { headers: NO_STORE_HEADERS },
    )
  }

  await supabase.from('travel_package_audit_events').insert({
    package_id: packageData.id,
    event_type: 'customer_portal_extension_requested',
    event_summary: 'Customer requested staff review of document portal access.',
    metadata: {
      task_id: task.id,
      requested_at: requestedAt,
      source: 'bookings_portal',
    },
  })

  return apiOk(
    { requested: true, alreadyRequested: false },
    { status: 202, headers: NO_STORE_HEADERS },
  )
}
