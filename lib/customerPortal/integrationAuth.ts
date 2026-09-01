import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { CustomerIntegrationError, integrationRequestId } from './http'
import {
  customerIntegrationForwardedHeadersDigest,
  signCustomerIntegrationForTests,
} from './signature'

export {
  customerIntegrationCanonicalInput,
  customerIntegrationForwardedHeadersDigest,
  signCustomerIntegrationForTests,
} from './signature'

const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

export interface CustomerIntegrationContext {
  keyId: string
  requestId: string
  nonce: string
  timestamp: string
  pathAndQuery: string
  bodyText: string
  bodyDigest: string
  idempotencyKey: string | null
}

function parseKeys(): Record<string, string> {
  const raw = process.env.CUSTOMER_PORTAL_INTEGRATION_KEYS
  if (!raw) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Customer integration keys are not configured.',
      503,
    )
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          /^[A-Za-z0-9._-]{1,80}$/.test(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].length >= 32,
      ),
    )
  } catch (cause) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Customer integration keys are invalid.',
      503,
      { cause },
    )
  }
}

function equalEncoded(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function authenticateCustomerIntegration(
  request: Request,
  options: {
    maxBodyBytes?: number
    requireIdempotency?: boolean
    timestampToleranceMs?: number
  } = {},
): Promise<CustomerIntegrationContext> {
  const requestId = integrationRequestId(request)
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    throw new CustomerIntegrationError('validation_failed', 'Request body is too large.', 413)
  }
  const bodyBytes = new Uint8Array(await request.arrayBuffer())
  if (bodyBytes.byteLength > maxBodyBytes) {
    throw new CustomerIntegrationError('validation_failed', 'Request body is too large.', 413)
  }
  const bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes)
  const keyId = request.headers.get('x-piyam-key-id') ?? ''
  const timestamp = request.headers.get('x-piyam-timestamp') ?? ''
  const nonce = request.headers.get('x-piyam-nonce') ?? ''
  const suppliedDigest = request.headers.get('x-piyam-content-sha256') ?? ''
  const suppliedForwardedHeadersDigest =
    request.headers.get('x-piyam-forwarded-headers-sha256') ?? ''
  const suppliedSignature = request.headers.get('x-piyam-signature') ?? ''
  const integrationOrigin = request.headers.get('x-piyam-origin')
  const idempotencyKey = request.headers.get('idempotency-key')

  if (integrationOrigin !== 'customer-portal') {
    throw new CustomerIntegrationError('forbidden', 'Integration origin is not allowed.', 403)
  }
  const browserOrigin = request.headers.get('origin')
  const allowedOrigin = process.env.CUSTOMER_PORTAL_ALLOWED_ORIGIN
  if (browserOrigin && (!allowedOrigin || browserOrigin !== allowedOrigin)) {
    throw new CustomerIntegrationError('forbidden', 'Request origin is not allowed.', 403)
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(keyId)) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(nonce)) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }
  const timestampMs = Date.parse(timestamp)
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) >
      (options.timestampToleranceMs ?? DEFAULT_TIMESTAMP_TOLERANCE_MS)
  ) {
    throw new CustomerIntegrationError('expired', 'Integration request has expired.', 401)
  }
  if (
    options.requireIdempotency &&
    (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey))
  ) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'A valid Idempotency-Key is required.',
      400,
    )
  }

  const secret = parseKeys()[keyId]
  if (!secret) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }
  const url = new URL(request.url)
  const pathAndQuery = `${url.pathname}${url.search}`
  const bodyDigest = createHash('sha256').update(bodyBytes).digest('base64url')
  if (!equalEncoded(suppliedDigest, bodyDigest)) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }
  const forwardedHeadersDigest = customerIntegrationForwardedHeadersDigest(request.headers)
  if (!equalEncoded(suppliedForwardedHeadersDigest, forwardedHeadersDigest)) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }
  const expectedSignature = signCustomerIntegrationForTests(secret, {
    method: request.method,
    pathAndQuery,
    keyId,
    timestamp,
    nonce,
    bodyDigest,
    forwardedHeadersDigest,
    idempotencyKey,
  })
  if (!equalEncoded(suppliedSignature, expectedSignature)) {
    throw new CustomerIntegrationError(
      'authentication_required',
      'Invalid integration credentials.',
      401,
    )
  }

  const service = getServiceSupabaseClient()
  const { error: nonceError } = await service.from('customer_integration_nonces').insert({
    key_id: keyId,
    nonce,
    request_id: requestId,
    expires_at: new Date(Date.now() + DEFAULT_TIMESTAMP_TOLERANCE_MS * 2).toISOString(),
  })
  if (nonceError) {
    if (nonceError.code === '23505') {
      throw new CustomerIntegrationError('conflict', 'Integration request was already used.', 409)
    }
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Integration replay protection is unavailable.',
      503,
      { cause: nonceError },
    )
  }

  return {
    keyId,
    requestId,
    nonce,
    timestamp,
    pathAndQuery,
    bodyText,
    bodyDigest,
    idempotencyKey,
  }
}

export function parseIntegrationJson<T>(
  context: CustomerIntegrationContext,
  parse: (value: unknown) => T,
): T {
  let value: unknown
  try {
    value = JSON.parse(context.bodyText)
  } catch (cause) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'Request body must be valid JSON.',
      400,
      { cause },
    )
  }
  try {
    return parse(value)
  } catch (cause) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'Request body did not match the integration contract.',
      400,
      { cause },
    )
  }
}

export interface IdempotencyClaim {
  cached: { status: number; body: unknown } | null
  complete: (status: number, body: unknown) => Promise<void>
}

export async function claimCustomerIdempotency(
  context: CustomerIntegrationContext,
  routeKey: string,
): Promise<IdempotencyClaim> {
  if (!context.idempotencyKey) {
    throw new CustomerIntegrationError('validation_failed', 'Idempotency-Key is required.', 400)
  }
  const service = getServiceSupabaseClient()
  const row = {
    key_id: context.keyId,
    route_key: routeKey,
    idempotency_key: context.idempotencyKey,
    request_digest: context.bodyDigest,
  }
  const complete = async (status: number, body: unknown) => {
    const { error: updateError } = await service
      .from('customer_integration_idempotency')
      .update({
        response_status: status,
        response_body: body,
        completed_at: new Date().toISOString(),
      })
      .eq('key_id', context.keyId)
      .eq('route_key', routeKey)
      .eq('idempotency_key', context.idempotencyKey)
    if (updateError) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Idempotency result could not be stored.',
        503,
      )
    }
  }
  const { error } = await service.from('customer_integration_idempotency').insert(row)
  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await service
      .from('customer_integration_idempotency')
      .select('request_digest,response_status,response_body,completed_at')
      .eq('key_id', context.keyId)
      .eq('route_key', routeKey)
      .eq('idempotency_key', context.idempotencyKey)
      .single()
    if (existingError || !existing) {
      throw new CustomerIntegrationError(
        'service_unavailable',
        'Idempotency state is unavailable.',
        503,
      )
    }
    if (existing.request_digest !== context.bodyDigest) {
      throw new CustomerIntegrationError(
        'conflict',
        'Idempotency key was reused with different data.',
        409,
      )
    }
    if (!existing.completed_at || existing.response_status == null) {
      // A process can fail after claiming a key. Reclaim only stale work; the
      // conditional timestamp update ensures concurrent retries cannot both win.
      const now = new Date()
      const staleBefore = new Date(now.getTime() - 60_000).toISOString()
      const { data: reclaimed, error: reclaimError } = await service
        .from('customer_integration_idempotency')
        .update({ created_at: now.toISOString() })
        .eq('key_id', context.keyId)
        .eq('route_key', routeKey)
        .eq('idempotency_key', context.idempotencyKey)
        .eq('request_digest', context.bodyDigest)
        .is('completed_at', null)
        .lt('created_at', staleBefore)
        .select('idempotency_key')
        .maybeSingle()
      if (reclaimError) {
        throw new CustomerIntegrationError(
          'service_unavailable',
          'Idempotency state is unavailable.',
          503,
        )
      }
      if (reclaimed) {
        return { cached: null, complete }
      }
      throw new CustomerIntegrationError(
        'conflict',
        'An identical request is already being processed.',
        409,
      )
    }
    return {
      cached: { status: existing.response_status, body: existing.response_body },
      complete: async () => undefined,
    }
  }
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Idempotency state is unavailable.',
      503,
    )
  }

  return {
    cached: null,
    complete,
  }
}
