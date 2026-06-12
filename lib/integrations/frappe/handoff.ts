import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

const HANDOFF_ISSUER = 'pt-portal'
const HANDOFF_AUDIENCE = 'frappe-hrms'
const DEFAULT_TTL_SECONDS = 90
const DEFAULT_TARGET_PATH = '/hrms'

export type FrappeHandoffIdentity = {
  employeeId: string
  email: string
  fullName: string
  frappeEmployeeId: string
  frappeUserId: string
  target?: string | null
}

export type FrappeHandoffPayload = {
  v: 1
  iss: typeof HANDOFF_ISSUER
  aud: typeof HANDOFF_AUDIENCE
  sub: string
  email: string
  full_name: string
  frappe_employee_id: string
  frappe_user_id: string
  target: string
  iat: number
  exp: number
  nonce: string
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getFrappeBaseUrl() {
  const baseUrl = process.env.FRAPPE_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl) {
    throw new Error('FRAPPE_BASE_URL is not configured')
  }
  return baseUrl
}

function getHandoffSecret() {
  const secret = process.env.FRAPPE_HANDOFF_SECRET || process.env.FRAPPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('FRAPPE_HANDOFF_SECRET is not configured')
  }
  return secret
}

function normalizeTargetPath(value: string | null | undefined) {
  if (!value) return DEFAULT_TARGET_PATH
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_TARGET_PATH
  if (value.startsWith('/api/') || value.startsWith('/assets/') || value.startsWith('/files/')) {
    return DEFAULT_TARGET_PATH
  }
  return value
}

function signPayload(payloadBase64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadBase64).digest('base64url')
}

export function createFrappeHandoffToken(
  identity: FrappeHandoffIdentity,
  options: { ttlSeconds?: number; now?: Date } = {},
) {
  const nowSeconds = Math.floor((options.now || new Date()).getTime() / 1000)
  const payload: FrappeHandoffPayload = {
    v: 1,
    iss: HANDOFF_ISSUER,
    aud: HANDOFF_AUDIENCE,
    sub: identity.employeeId,
    email: identity.email,
    full_name: identity.fullName,
    frappe_employee_id: identity.frappeEmployeeId,
    frappe_user_id: identity.frappeUserId,
    target: normalizeTargetPath(identity.target),
    iat: nowSeconds,
    exp: nowSeconds + (options.ttlSeconds || DEFAULT_TTL_SECONDS),
    nonce: randomUUID(),
  }

  const payloadBase64 = base64Url(JSON.stringify(payload))
  const signature = signPayload(payloadBase64, getHandoffSecret())
  return `${payloadBase64}.${signature}`
}

export function buildFrappeHandoffUrl(identity: FrappeHandoffIdentity) {
  const url = new URL('/api/method/piyam_ims_bridge.api.handoff.consume', getFrappeBaseUrl())
  url.searchParams.set('token', createFrappeHandoffToken(identity))
  return url.toString()
}

export function verifyFrappeHandoffTokenForTests(token: string, secret: string) {
  const [payloadBase64, signature] = token.split('.')
  if (!payloadBase64 || !signature) {
    throw new Error('Invalid token format')
  }

  const expected = signPayload(payloadBase64, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid token signature')
  }

  return JSON.parse(decodeBase64Url(payloadBase64)) as FrappeHandoffPayload
}
