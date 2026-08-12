import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRequestId,
  logServerEvent,
  redactForLogs,
  reportOperationalError,
} from '@/lib/observability/server'

describe('server observability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    delete process.env.OBSERVABILITY_ALERT_WEBHOOK_URL
  })

  it('uses a safe caller request id and rejects unsafe values', () => {
    expect(
      getRequestId(
        new Request('https://portal.test/api/test', {
          headers: { 'x-request-id': 'req-12345678' },
        }),
      ),
    ).toBe('req-12345678')
    expect(
      getRequestId(
        new Request('https://portal.test/api/test', { headers: { 'x-request-id': 'short' } }),
      ),
    ).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('redacts secrets recursively', () => {
    expect(
      redactForLogs({
        password: 'hunter2',
        nested: { verificationCode: '123456', safe: 'visible' },
        authorization: 'Bearer token',
      }),
    ).toEqual({
      password: '[REDACTED]',
      nested: { verificationCode: '[REDACTED]', safe: 'visible' },
      authorization: '[REDACTED]',
    })
  })

  it('redacts credentials embedded in string values', () => {
    const redacted = redactForLogs({
      header: 'Authorization: Bearer eyJhbGciOiJIUzI1Ni.secret.signature',
      request:
        'GET https://portal.test/callback?access_token=query-secret&safe=visible&api_key=second-secret#id_token=fragment-secret',
      detail: 'password=hunter2 api-key: "quoted-secret" harmless=value',
      databaseUrl: 'postgresql://portal:database-secret@db.example.test/portal',
      'https://portal.test/failure?token=key-secret': 'failed request',
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1Ni.secret.signature')
    expect(serialized).not.toContain('query-secret')
    expect(serialized).not.toContain('second-secret')
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('quoted-secret')
    expect(serialized).not.toContain('database-secret')
    expect(serialized).not.toContain('fragment-secret')
    expect(serialized).not.toContain('key-secret')
    expect(serialized).toContain('safe=visible')
    expect(serialized).toContain('harmless=value')
    expect(redactForLogs(redacted)).toEqual(redacted)
  })

  it('bounds text processing without leaking a credential across the output limit', () => {
    const prefix = 'x'.repeat(3_990)
    const secret = 'boundary-secret-'.repeat(200)
    const redacted = String(redactForLogs(`${prefix} token=${secret}`))

    expect(redacted.length).toBeLessThanOrEqual(4_000)
    expect(redacted).not.toContain('boundary-secret')
    expect(redacted).toContain('[REDACTED]')
  })

  it('writes structured errors without leaking sensitive context', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const requestId = logServerEvent({
      event: 'lms.rpc_failed',
      level: 'error',
      requestId: 'req-abcdefgh',
      error: new Error('database failed'),
      context: { customerId: 'customer-1', backupCode: 'ABCD-1234' },
    })

    expect(requestId).toBe('req-abcdefgh')
    const entry = JSON.parse(String(error.mock.calls[0]?.[0]))
    expect(entry.event).toBe('lms.rpc_failed')
    expect(entry.context).toEqual({ customerId: 'customer-1', backupCode: '[REDACTED]' })
  })

  it('redacts secrets in error messages and development stacks', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error(
      'request failed: https://portal.test/callback?token=message-secret&safe=visible',
    )
    failure.stack =
      'Error: Authorization: Bearer stack-bearer-secret\n    at request (refresh_token=stack-refresh-secret)'

    logServerEvent({
      event: 'auth.provider_failed',
      level: 'error',
      requestId: 'req-abcdefgh',
      error: failure,
    })

    const entry = JSON.parse(String(consoleError.mock.calls[0]?.[0]))
    const serializedError = JSON.stringify(entry.error)
    expect(serializedError).not.toContain('message-secret')
    expect(serializedError).not.toContain('stack-bearer-secret')
    expect(serializedError).not.toContain('stack-refresh-secret')
    expect(entry.error.message).toContain('safe=visible')
    expect(entry.error.stack).toContain('[REDACTED]')
  })

  it('delivers a redacted optional operations alert', async () => {
    process.env.OBSERVABILITY_ALERT_WEBHOOK_URL = 'https://alerts.example.test/hook'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }))

    await reportOperationalError({
      event: 'documents.storage_failed',
      requestId: 'req-abcdefgh',
      alert: true,
      error: new Error('storage unavailable'),
      context: { documentId: 'doc-1', apiKey: 'do-not-log' },
    })

    const init = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body))
    expect(body.context).toEqual({ documentId: 'doc-1', apiKey: '[REDACTED]' })
  })
})
