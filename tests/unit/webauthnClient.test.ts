import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissPasskeyPrompt,
  hasDismissedPasskeyPrompt,
  preparePublicKeyRequestOptions,
  serializeAuthenticationCredential,
} from '@/lib/auth/webauthnClient'

describe('WebAuthn browser helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('snoozes the setup prompt for 30 days instead of permanently hiding it', () => {
    dismissPasskeyPrompt()
    expect(hasDismissedPasskeyPrompt()).toBe(true)

    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1)
    expect(hasDismissedPasskeyPrompt()).toBe(false)
  })

  it('deserializes server challenge and credential IDs to ArrayBuffers', () => {
    const options = preparePublicKeyRequestOptions({
      challenge: 'AQID',
      allowCredentials: [{ id: 'BAUG', type: 'public-key' as const }],
      timeout: 60_000,
    })

    expect(Array.from(new Uint8Array(options.challenge))).toEqual([1, 2, 3])
    expect(Array.from(new Uint8Array(options.allowCredentials?.[0].id as ArrayBuffer))).toEqual([
      4, 5, 6,
    ])
  })

  it('uses the browser WebAuthn JSON serializer when available', () => {
    const serialized = { id: 'credential-1', type: 'public-key' }
    const credential = {
      toJSON: vi.fn(() => serialized),
    } as unknown as PublicKeyCredential

    expect(serializeAuthenticationCredential(credential)).toBe(serialized)
  })
})
