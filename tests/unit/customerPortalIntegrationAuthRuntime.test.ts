import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  is: vi.fn(),
  lt: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import {
  authenticateCustomerIntegration,
  claimCustomerIdempotency,
  customerIntegrationForwardedHeadersDigest,
  parseIntegrationJson,
  signCustomerIntegrationForTests,
} from '@/lib/customerPortal/integrationAuth'
import type { CustomerIntegrationContext } from '@/lib/customerPortal/integrationAuth'

const TEST_KEY_ID = 'customer-2026-08'
const TEST_SECRET = 'test-secret-that-is-long-enough-for-hmac-rotation'
const TEST_NOW = new Date('2026-08-31T12:00:00.000Z')

function signedRequest(
  bodyText = '{"trackingNumber":"ABC123","surname":"Khan"}',
  options: {
    browserOrigin?: string
    idempotencyKey?: string
    nonce?: string
    path?: string
    forwardedHeaders?: Record<string, string>
    signedForwardedHeaders?: Record<string, string>
    signedBodyText?: string
    timestamp?: string
  } = {},
) {
  const path = options.path ?? '/api/integrations/customer/v1/applications/lookup'
  const timestamp = options.timestamp ?? TEST_NOW.toISOString()
  const nonce = options.nonce ?? 'VjZ4T2JUVmFMbDdKQk9qSg'
  const signedBodyText = options.signedBodyText ?? bodyText
  const bodyDigest = createHash('sha256').update(signedBodyText).digest('base64url')
  const forwardedHeadersDigest = customerIntegrationForwardedHeadersDigest(
    new Headers(options.signedForwardedHeaders ?? options.forwardedHeaders),
  )
  const signature = signCustomerIntegrationForTests(TEST_SECRET, {
    method: 'POST',
    pathAndQuery: path,
    keyId: TEST_KEY_ID,
    timestamp,
    nonce,
    bodyDigest,
    forwardedHeadersDigest,
    idempotencyKey: options.idempotencyKey ?? null,
  })
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-piyam-content-sha256': bodyDigest,
    'x-piyam-forwarded-headers-sha256': forwardedHeadersDigest,
    'x-piyam-key-id': TEST_KEY_ID,
    'x-piyam-nonce': nonce,
    'x-piyam-origin': 'customer-portal',
    'x-piyam-signature': signature,
    'x-piyam-timestamp': timestamp,
    'x-request-id': 'request-security-0001',
  }
  if (options.browserOrigin) headers.origin = options.browserOrigin
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey
  Object.assign(headers, options.forwardedHeaders)

  return new Request(`https://staff.piyam.test${path}`, {
    method: 'POST',
    headers,
    body: bodyText,
  })
}

describe('customer integration request authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(TEST_NOW)
    process.env.CUSTOMER_PORTAL_INTEGRATION_KEYS = JSON.stringify({
      [TEST_KEY_ID]: TEST_SECRET,
    })
    process.env.CUSTOMER_PORTAL_ALLOWED_ORIGIN = 'https://portal.piyamtravel.com'
    const builder = {
      eq: mocks.eq,
      insert: mocks.insert,
      is: mocks.is,
      lt: mocks.lt,
      maybeSingle: mocks.maybeSingle,
      select: mocks.select,
      single: mocks.single,
      update: mocks.update,
    }
    mocks.eq.mockReturnValue(builder)
    mocks.is.mockReturnValue(builder)
    mocks.lt.mockReturnValue(builder)
    mocks.select.mockReturnValue(builder)
    mocks.update.mockReturnValue(builder)
    mocks.insert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue(builder)
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
  })

  it('accepts a correctly signed request and records its nonce', async () => {
    const context = await authenticateCustomerIntegration(signedRequest())

    expect(context).toMatchObject({
      keyId: TEST_KEY_ID,
      requestId: 'request-security-0001',
      pathAndQuery: '/api/integrations/customer/v1/applications/lookup',
    })
    expect(mocks.from).toHaveBeenCalledWith('customer_integration_nonces')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        key_id: TEST_KEY_ID,
        nonce: 'VjZ4T2JUVmFMbDdKQk9qSg',
        request_id: 'request-security-0001',
      }),
    )
  })

  it('rejects stale timestamps before accessing replay storage', async () => {
    await expect(
      authenticateCustomerIntegration(
        signedRequest(undefined, { timestamp: '2026-08-31T11:54:59.999Z' }),
      ),
    ).rejects.toMatchObject({ code: 'expired', status: 401 })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects a body changed after signing', async () => {
    await expect(
      authenticateCustomerIntegration(
        signedRequest('{"trackingNumber":"ALTERED","surname":"Khan"}', {
          signedBodyText: '{"trackingNumber":"ABC123","surname":"Khan"}',
        }),
      ),
    ).rejects.toMatchObject({ code: 'authentication_required', status: 401 })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects an authorization header changed after signing', async () => {
    await expect(
      authenticateCustomerIntegration(
        signedRequest(undefined, {
          forwardedHeaders: { 'x-piyam-access-grant': 'grant-after-signing' },
          signedForwardedHeaders: { 'x-piyam-access-grant': 'grant-that-was-signed' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'authentication_required', status: 401 })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects browser origins outside the configured portal origin', async () => {
    await expect(
      authenticateCustomerIntegration(
        signedRequest(undefined, { browserOrigin: 'https://attacker.example' }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })

  it('rejects a replayed nonce', async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: '23505' } })

    await expect(authenticateCustomerIntegration(signedRequest())).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
    })
  })

  it('enforces mutation idempotency and body-size limits', async () => {
    await expect(
      authenticateCustomerIntegration(signedRequest(), { requireIdempotency: true }),
    ).rejects.toMatchObject({ code: 'validation_failed', status: 400 })

    await expect(
      authenticateCustomerIntegration(signedRequest('{"long":"payload"}'), {
        maxBodyBytes: 8,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed', status: 413 })
  })

  it('normalizes malformed and contract-invalid JSON into safe validation errors', async () => {
    const malformed = await authenticateCustomerIntegration(signedRequest('{'))
    expect(() => parseIntegrationJson(malformed, (value) => value)).toThrowError(
      expect.objectContaining({ code: 'validation_failed', status: 400 }),
    )

    const unknownField = await authenticateCustomerIntegration(
      signedRequest('{"trackingNumber":"ABC123","surname":"Khan","internalId":"secret"}', {
        nonce: 'Q2hhbmdlZE5vbmNlRm9yVGVzdA',
      }),
    )
    expect(() =>
      parseIntegrationJson(unknownField, (value) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          Object.keys(value).some((key) => !['trackingNumber', 'surname'].includes(key))
        ) {
          throw new Error('Unknown field')
        }
        return value
      }),
    ).toThrowError(expect.objectContaining({ code: 'validation_failed', status: 400 }))
  })
})

describe('customer integration idempotency', () => {
  const context: CustomerIntegrationContext = {
    bodyDigest: 'digest-one',
    bodyText: '{"value":1}',
    idempotencyKey: 'appointment-create-0001',
    keyId: TEST_KEY_ID,
    nonce: 'VjZ4T2JUVmFMbDdKQk9qSg',
    pathAndQuery: '/api/integrations/customer/v1/appointments',
    requestId: 'request-idempotency-0001',
    timestamp: TEST_NOW.toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(TEST_NOW)
    const builder = {
      eq: mocks.eq,
      insert: mocks.insert,
      is: mocks.is,
      lt: mocks.lt,
      maybeSingle: mocks.maybeSingle,
      select: mocks.select,
      single: mocks.single,
      update: mocks.update,
    }
    mocks.eq.mockReturnValue(builder)
    mocks.is.mockReturnValue(builder)
    mocks.lt.mockReturnValue(builder)
    mocks.select.mockReturnValue(builder)
    mocks.update.mockReturnValue(builder)
    mocks.from.mockReturnValue(builder)
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
  })

  it('claims and completes a new mutation key', async () => {
    mocks.insert.mockResolvedValue({ error: null })

    const claim = await claimCustomerIdempotency(context, 'appointments.create')
    expect(claim.cached).toBeNull()
    await claim.complete(201, { data: { reference: 'APT-123' }, error: null })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotency_key: context.idempotencyKey,
        request_digest: context.bodyDigest,
        route_key: 'appointments.create',
      }),
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ response_status: 201, completed_at: expect.any(String) }),
    )
  })

  it('returns an already completed response without running completion again', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505' } })
    mocks.single.mockResolvedValue({
      data: {
        request_digest: context.bodyDigest,
        response_status: 201,
        response_body: { data: { reference: 'APT-CACHED' }, error: null },
        completed_at: '2026-08-31T11:59:00.000Z',
      },
      error: null,
    })

    const claim = await claimCustomerIdempotency(context, 'appointments.create')
    expect(claim.cached).toEqual({
      status: 201,
      body: { data: { reference: 'APT-CACHED' }, error: null },
    })
    await claim.complete(500, { error: 'must not overwrite' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects reuse of a key with a different request body', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505' } })
    mocks.single.mockResolvedValue({
      data: {
        request_digest: 'different-digest',
        response_status: 201,
        response_body: {},
        completed_at: '2026-08-31T11:59:00.000Z',
      },
      error: null,
    })

    await expect(claimCustomerIdempotency(context, 'appointments.create')).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
    })
  })

  it('allows one stale in-flight claim to be recovered', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505' } })
    mocks.single.mockResolvedValue({
      data: {
        request_digest: context.bodyDigest,
        response_status: null,
        response_body: null,
        completed_at: null,
      },
      error: null,
    })
    mocks.maybeSingle.mockResolvedValue({
      data: { idempotency_key: context.idempotencyKey },
      error: null,
    })

    const claim = await claimCustomerIdempotency(context, 'appointments.create')
    expect(claim.cached).toBeNull()
    expect(mocks.lt).toHaveBeenCalledWith('created_at', '2026-08-31T11:59:00.000Z')
  })
})
