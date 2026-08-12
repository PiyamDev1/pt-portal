import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyFrappeWebhookSignature } from '@/lib/integrations/frappe/webhookAuth'

describe('Frappe webhook authentication', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed when the webhook secret is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FRAPPE_WEBHOOK_SECRET', '')

    expect(verifyFrappeWebhookSignature('{"event":"update"}', null)).toBe(false)
  })

  it('also requires a configured secret during local development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('FRAPPE_WEBHOOK_SECRET', '')

    expect(verifyFrappeWebhookSignature('{"event":"update"}', null)).toBe(false)
  })

  it('accepts only a matching HMAC when a secret is configured', () => {
    const body = '{"event":"update"}'
    const secret = 'test-webhook-secret'
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    vi.stubEnv('FRAPPE_WEBHOOK_SECRET', secret)

    expect(verifyFrappeWebhookSignature(body, `sha256=${signature}`)).toBe(true)
    expect(verifyFrappeWebhookSignature(body, '0'.repeat(64))).toBe(false)
  })
})
