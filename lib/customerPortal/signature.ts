import { createHash, createHmac } from 'node:crypto'

export const CUSTOMER_INTEGRATION_FORWARDED_HEADER_NAMES = [
  'range',
  'x-piyam-access-grant',
  'x-piyam-customer-subject',
] as const

export function customerIntegrationForwardedHeadersDigest(headers: Headers) {
  const canonical = CUSTOMER_INTEGRATION_FORWARDED_HEADER_NAMES.map(
    (name) => `${name}:${headers.get(name) ?? ''}`,
  ).join('\n')
  return createHash('sha256').update(canonical).digest('base64url')
}

export function customerIntegrationCanonicalInput(input: {
  method: string
  pathAndQuery: string
  keyId: string
  timestamp: string
  nonce: string
  bodyDigest: string
  forwardedHeadersDigest: string
  idempotencyKey?: string | null
}) {
  return [
    input.method.toUpperCase(),
    input.pathAndQuery,
    input.keyId,
    input.timestamp,
    input.nonce,
    input.bodyDigest,
    input.forwardedHeadersDigest,
    input.idempotencyKey ?? '',
  ].join('\n')
}

export function signCustomerIntegrationForTests(
  secret: string,
  input: Parameters<typeof customerIntegrationCanonicalInput>[0],
) {
  return createHmac('sha256', secret)
    .update(customerIntegrationCanonicalInput(input))
    .digest('base64url')
}
