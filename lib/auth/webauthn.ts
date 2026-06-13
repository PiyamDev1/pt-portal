import { createHash, createPublicKey, createVerify, randomBytes } from 'crypto'
import type { JsonWebKey as NodeJsonWebKey } from 'crypto'
import { base64urlToBuffer, bufferToBase64url } from '@/lib/auth/base64url'

/**
 * Minimal WebAuthn server-side helpers for the IMS PWA/passkey flow.
 *
 * We keep this implementation local and explicit so developers can follow the
 * challenge, attestation, and assertion steps without having to treat a third-
 * party library as a black box.
 */
const CHALLENGE_BYTES = 32
const CHALLENGE_TTL_MS = 5 * 60 * 1000

type CoseKey = Map<number, unknown>

export type WebAuthnContext = {
  origin: string
  rpId: string
}

export type ParsedAttestation = {
  credentialId: string
  publicKeyJwk: NodeJsonWebKey
  signCount: number
}

export type ParsedAssertion = {
  credentialId: string
  signCount: number
  signatureValid: boolean
}

class CborReader {
  private offset = 0

  constructor(private readonly data: Buffer) {}

  read(): unknown {
    const initial = this.readByte()
    const major = initial >> 5
    const additional = initial & 0x1f
    const length = this.readLength(additional)

    if (major === 0) return length
    if (major === 1) return -1 - length
    if (major === 2) return this.readBytes(Number(length))
    if (major === 3) return this.readBytes(Number(length)).toString('utf8')
    if (major === 4) {
      return Array.from({ length: Number(length) }, () => this.read())
    }
    if (major === 5) {
      const map = new Map<unknown, unknown>()
      for (let i = 0; i < Number(length); i += 1) {
        map.set(this.read(), this.read())
      }
      return map
    }
    if (major === 7) {
      if (additional === 20) return false
      if (additional === 21) return true
      if (additional === 22) return null
    }

    throw new Error('Unsupported CBOR value in WebAuthn response')
  }

  private readByte() {
    if (this.offset >= this.data.length) throw new Error('Unexpected end of CBOR data')
    const value = this.data[this.offset]
    this.offset += 1
    return value
  }

  private readBytes(length: number) {
    const end = this.offset + length
    if (end > this.data.length) throw new Error('Unexpected end of CBOR bytes')
    const value = this.data.subarray(this.offset, end)
    this.offset = end
    return value
  }

  private readLength(additional: number) {
    if (additional < 24) return additional
    if (additional === 24) return this.readByte()
    if (additional === 25) {
      const value = this.data.readUInt16BE(this.offset)
      this.offset += 2
      return value
    }
    if (additional === 26) {
      const value = this.data.readUInt32BE(this.offset)
      this.offset += 4
      return value
    }
    throw new Error('Unsupported CBOR integer length')
  }
}

/**
 * Generate a random challenge that the client must sign once.
 */
export function createWebAuthnChallenge() {
  return bufferToBase64url(randomBytes(CHALLENGE_BYTES))
}

export function getChallengeExpiry() {
  return new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
}

/**
 * Derive the relying-party context from the incoming request.
 *
 * This matters because passkeys are origin- and RP-ID-bound. If these values do
 * not match what the browser thinks it is authenticating for, verification must
 * fail.
 */
export function getWebAuthnContext(request: Request): WebAuthnContext {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host') || new URL(request.url).host
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const protocol = forwardedProto || new URL(request.url).protocol.replace(':', '')
  const hostname = host.split(':')[0]
  return {
    origin: `${protocol}://${host}`,
    rpId: hostname,
  }
}

export function verifyClientData(params: {
  clientDataJSON: string
  expectedType: 'webauthn.create' | 'webauthn.get'
  expectedChallenge: string
  expectedOrigin: string
}) {
  const clientDataBuffer = base64urlToBuffer(params.clientDataJSON)
  const clientData = JSON.parse(clientDataBuffer.toString('utf8')) as {
    type?: string
    challenge?: string
    origin?: string
  }

  if (clientData.type !== params.expectedType) {
    throw new Error('Invalid biometric response type')
  }
  if (clientData.challenge !== params.expectedChallenge) {
    throw new Error('Invalid biometric challenge')
  }
  if (clientData.origin !== params.expectedOrigin) {
    throw new Error('Invalid biometric origin')
  }

  return {
    clientData,
    clientDataBuffer,
    clientDataHash: createHash('sha256').update(clientDataBuffer).digest(),
  }
}

/**
 * Parse the authenticator data blob and enforce the most important guarantees:
 * - the credential was created for this relying party
 * - the user was present
 * - the user was verified by the authenticator
 */
export function parseAuthenticatorData(authenticatorData: Buffer, rpId: string) {
  if (authenticatorData.length < 37) {
    throw new Error('Invalid authenticator data')
  }

  const expectedRpIdHash = createHash('sha256').update(rpId).digest()
  const rpIdHash = authenticatorData.subarray(0, 32)
  if (!rpIdHash.equals(expectedRpIdHash)) {
    throw new Error('Invalid biometric relying party')
  }

  const flags = authenticatorData[32]
  const userPresent = Boolean(flags & 0x01)
  const userVerified = Boolean(flags & 0x04)
  const hasAttestedCredentialData = Boolean(flags & 0x40)
  const signCount = authenticatorData.readUInt32BE(33)

  if (!userPresent || !userVerified) {
    throw new Error('Biometric verification was not completed')
  }

  return {
    hasAttestedCredentialData,
    signCount,
  }
}

function coseToJwk(coseKey: CoseKey): NodeJsonWebKey {
  const kty = coseKey.get(1)
  const alg = coseKey.get(3)
  const crv = coseKey.get(-1)
  const x = coseKey.get(-2)
  const y = coseKey.get(-3)

  if (kty !== 2 || alg !== -7 || crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y)) {
    throw new Error('Unsupported biometric credential key type')
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: bufferToBase64url(x),
    y: bufferToBase64url(y),
    ext: true,
    key_ops: ['verify'],
  }
}

/**
 * Validate registration attestation and extract the credential we will store.
 */
export function parseRegistrationAttestation(params: {
  attestationObject: string
  clientDataJSON: string
  expectedChallenge: string
  expectedOrigin: string
  rpId: string
}): ParsedAttestation {
  verifyClientData({
    clientDataJSON: params.clientDataJSON,
    expectedType: 'webauthn.create',
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
  })

  const attestation = new CborReader(base64urlToBuffer(params.attestationObject)).read()
  if (!(attestation instanceof Map)) {
    throw new Error('Invalid biometric attestation')
  }

  const authData = attestation.get('authData')
  if (!Buffer.isBuffer(authData)) {
    throw new Error('Missing biometric authenticator data')
  }

  const parsedAuthData = parseAuthenticatorData(authData, params.rpId)
  if (!parsedAuthData.hasAttestedCredentialData) {
    throw new Error('Missing biometric credential data')
  }

  let offset = 37
  offset += 16
  const credentialIdLength = authData.readUInt16BE(offset)
  offset += 2
  const credentialId = authData.subarray(offset, offset + credentialIdLength)
  offset += credentialIdLength

  const coseKey = new CborReader(authData.subarray(offset)).read()
  if (!(coseKey instanceof Map)) {
    throw new Error('Invalid biometric public key')
  }

  return {
    credentialId: bufferToBase64url(credentialId),
    publicKeyJwk: coseToJwk(coseKey as CoseKey),
    signCount: parsedAuthData.signCount,
  }
}

/**
 * Validate a login assertion and reject replayed counters when available.
 */
export function verifyAuthenticationAssertion(params: {
  credentialId: string
  authenticatorData: string
  clientDataJSON: string
  signature: string
  expectedChallenge: string
  expectedOrigin: string
  rpId: string
  publicKeyJwk: NodeJsonWebKey
  storedSignCount: number
}): ParsedAssertion {
  const { clientDataHash } = verifyClientData({
    clientDataJSON: params.clientDataJSON,
    expectedType: 'webauthn.get',
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
  })

  const authenticatorData = base64urlToBuffer(params.authenticatorData)
  const parsedAuthData = parseAuthenticatorData(authenticatorData, params.rpId)
  const signedData = Buffer.concat([authenticatorData, clientDataHash])
  const verifier = createVerify('SHA256')
  verifier.update(signedData)
  verifier.end()

  const signatureValid = verifier.verify(
    createPublicKey({ key: params.publicKeyJwk, format: 'jwk' }),
    base64urlToBuffer(params.signature),
  )

  if (!signatureValid) {
    throw new Error('Invalid biometric signature')
  }

  if (parsedAuthData.signCount !== 0 && parsedAuthData.signCount <= params.storedSignCount) {
    throw new Error('Biometric credential replay detected')
  }

  return {
    credentialId: params.credentialId,
    signCount: parsedAuthData.signCount,
    signatureValid,
  }
}
