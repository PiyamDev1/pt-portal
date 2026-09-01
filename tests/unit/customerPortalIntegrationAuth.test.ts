import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  customerIntegrationCanonicalInput,
  customerIntegrationForwardedHeadersDigest,
  signCustomerIntegrationForTests,
} from '@/lib/customerPortal/signature'

describe('customer integration signature protocol', () => {
  const base = {
    method: 'POST',
    pathAndQuery: '/api/integrations/customer/v1/applications/lookup',
    keyId: 'customer-2026-08',
    timestamp: '2026-08-31T12:00:00.000Z',
    nonce: 'VjZ4T2JUVmFMbDdKQk9qSg',
    bodyDigest: createHash('sha256')
      .update('{"trackingNumber":"ABC123","surname":"Khan"}')
      .digest('base64url'),
    forwardedHeadersDigest: customerIntegrationForwardedHeadersDigest(new Headers()),
    idempotencyKey: null,
  }

  it('uses the documented line-delimited canonical order', () => {
    expect(customerIntegrationCanonicalInput(base)).toBe(
      [
        'POST',
        '/api/integrations/customer/v1/applications/lookup',
        'customer-2026-08',
        '2026-08-31T12:00:00.000Z',
        'VjZ4T2JUVmFMbDdKQk9qSg',
        base.bodyDigest,
        base.forwardedHeadersDigest,
        '',
      ].join('\n'),
    )
  })

  it('changes the signature when the body digest or route changes', () => {
    const secret = 'test-secret-that-is-long-enough-for-hmac-rotation'
    const signature = signCustomerIntegrationForTests(secret, base)
    expect(
      signCustomerIntegrationForTests(secret, {
        ...base,
        bodyDigest: createHash('sha256').update('tampered').digest('base64url'),
      }),
    ).not.toBe(signature)
    expect(
      signCustomerIntegrationForTests(secret, {
        ...base,
        pathAndQuery: `${base.pathAndQuery}?unexpected=true`,
      }),
    ).not.toBe(signature)
    expect(
      signCustomerIntegrationForTests(secret, {
        ...base,
        forwardedHeadersDigest: customerIntegrationForwardedHeadersDigest(
          new Headers({ 'x-piyam-access-grant': 'grant-one' }),
        ),
      }),
    ).not.toBe(signature)
  })
})
