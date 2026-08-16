import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  nativeSignIn: vi.fn(),
  startAuthentication: vi.fn(),
  verifyAuthentication: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getClaims: vi.fn(),
  credentialGet: vi.fn(),
  prepareRequestOptions: vi.fn((options: unknown) => options),
  serializeCredential: vi.fn(() => ({ id: 'serialized-credential' })),
  successToast: vi.fn(),
  warningToast: vi.fn(),
}))

const browserClient = {
  auth: {
    registerPasskey: mocks.register,
    signInWithPasskey: mocks.nativeSignIn,
    getClaims: mocks.getClaims,
    passkey: {
      startAuthentication: mocks.startAuthentication,
      verifyAuthentication: mocks.verifyAuthentication,
      list: mocks.list,
      update: mocks.update,
      delete: mocks.remove,
    },
  },
}

vi.mock('@/lib/auth/browserSupabase', () => ({
  getBrowserSupabaseClient: () => browserClient,
}))

vi.mock('@/lib/auth/webauthnClient', () => ({
  isWebAuthnSupported: () => true,
  preparePublicKeyRequestOptions: mocks.prepareRequestOptions,
  serializeAuthenticationCredential: mocks.serializeCredential,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.successToast,
    warning: mocks.warningToast,
  },
}))

import {
  getPasskeyErrorMessage,
  getPortalAssuranceFromClaims,
  getPortalSessionAssurance,
  registerPasskeyForCurrentUser,
  signInWithPasskey,
} from '@/lib/auth/passkeyClientActions'

const session = {
  access_token: 'signed-access-token',
  refresh_token: 'refresh-token',
  user: { id: 'user-1' },
}

describe('native passkey client actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { get: mocks.credentialGet, create: vi.fn() },
    })
  })

  it('derives portal assurance only from signed authentication claims', () => {
    expect(
      getPortalAssuranceFromClaims({
        aal: 'aal1',
        amr: [{ method: 'passkey', timestamp: 1 }],
      }),
    ).toBe('passkey')
    expect(getPortalAssuranceFromClaims({ aal: 'aal1', amr: ['passkey'] })).toBe('passkey')
    expect(getPortalAssuranceFromClaims({ aal: 'aal2', amr: [{ method: 'password' }] })).toBe(
      'aal2',
    )
    expect(getPortalAssuranceFromClaims({ aal: 'aal1', amr: [{ method: 'password' }] })).toBe(
      'aal1',
    )
  })

  it('fails closed when JWT claim verification fails', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error('invalid signature') })

    await expect(
      getPortalSessionAssurance(browserClient as unknown as SupabaseClient, 'untrusted-token'),
    ).resolves.toBe('aal1')
  })

  it('registers a native passkey and applies a bounded friendly name', async () => {
    mocks.register.mockResolvedValue({
      data: { id: 'passkey-1', friendly_name: undefined, created_at: '2026-08-16T00:00:00Z' },
      error: null,
    })
    mocks.update.mockResolvedValue({
      data: { id: 'passkey-1', friendly_name: 'Pixel 8 Pro', created_at: '2026-08-16T00:00:00Z' },
      error: null,
    })

    await registerPasskeyForCurrentUser(`  ${'Pixel 8 Pro'.padEnd(140, '!')}  `)

    expect(mocks.register).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith({
      passkeyId: 'passkey-1',
      friendlyName: expect.stringMatching(/^Pixel 8 Pro/),
    })
    expect(mocks.update.mock.calls[0][0].friendlyName).toHaveLength(120)
    expect(mocks.successToast).toHaveBeenCalledWith('Passkey added to your account')
  })

  it('uses the native one-call flow for explicit passkey sign-in', async () => {
    mocks.nativeSignIn.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    })
    const controller = new AbortController()

    const result = await signInWithPasskey({ signal: controller.signal })

    expect(mocks.nativeSignIn).toHaveBeenCalledWith({ options: { signal: controller.signal } })
    expect(result).toEqual({ session, user: session.user })
  })

  it('uses conditional mediation without exposing the challenge to portal APIs', async () => {
    const requestOptions = { challenge: 'challenge', allowCredentials: [] }
    const browserCredential = { id: 'credential-1', type: 'public-key' }
    mocks.startAuthentication.mockResolvedValue({
      data: { challenge_id: 'challenge-1', options: requestOptions, expires_at: 1 },
      error: null,
    })
    mocks.credentialGet.mockResolvedValue(browserCredential)
    mocks.verifyAuthentication.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    })

    const result = await signInWithPasskey({ conditional: true })

    expect(mocks.prepareRequestOptions).toHaveBeenCalledWith(requestOptions)
    expect(mocks.credentialGet).toHaveBeenCalledWith(
      expect.objectContaining({ mediation: 'conditional', publicKey: requestOptions }),
    )
    expect(mocks.serializeCredential).toHaveBeenCalledWith(browserCredential)
    expect(mocks.verifyAuthentication).toHaveBeenCalledWith({
      challengeId: 'challenge-1',
      credential: { id: 'serialized-credential' },
    })
    expect(result).toEqual({ session, user: session.user })
  })

  it('returns stable user-facing errors for disabled or cancelled passkey flows', async () => {
    mocks.nativeSignIn.mockResolvedValue({ data: null, error: { code: 'passkey_disabled' } })

    await expect(signInWithPasskey()).rejects.toThrow(
      'Passkeys are not enabled for this portal environment yet.',
    )
    expect(getPasskeyErrorMessage({ name: 'NotAllowedError' })).toBe(
      'The passkey request was cancelled or timed out.',
    )
  })
})
