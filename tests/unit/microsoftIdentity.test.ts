import type { UserIdentity } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  findMicrosoftIdentity,
  getMicrosoftIdentityEmail,
  getMicrosoftLinkErrorMessage,
  reconcileMicrosoftIdentity,
} from '@/lib/auth/microsoftIdentity'

function identity(provider: string, email: unknown): UserIdentity {
  return {
    id: `${provider}-identity`,
    identity_id: `${provider}-identity`,
    user_id: 'user-1',
    provider,
    identity_data: { email },
    created_at: '2026-08-16T00:00:00Z',
  }
}

describe('Microsoft identity linking', () => {
  it('finds Azure identities and normalizes their email', () => {
    const azure = identity('azure', ' Staff@PiyamTravel.com ')

    expect(findMicrosoftIdentity([identity('email', 'staff@piyamtravel.com'), azure])).toBe(azure)
    expect(getMicrosoftIdentityEmail(azure)).toBe('staff@piyamtravel.com')
  })

  it('accepts only an exact case-insensitive match with the IMS email', async () => {
    const azure = identity('azure', 'STAFF@PIYAMTRAVEL.COM')
    const auth = {
      getUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [azure] }, error: null }),
      unlinkIdentity: vi.fn(),
    }

    await expect(
      reconcileMicrosoftIdentity(auth as never, 'staff@piyamtravel.com'),
    ).resolves.toEqual({ status: 'linked', identity: azure, email: 'staff@piyamtravel.com' })
    expect(auth.unlinkIdentity).not.toHaveBeenCalled()
  })

  it('immediately removes a Microsoft identity with a different email', async () => {
    const azure = identity('azure', 'another.user@piyamtravel.com')
    const auth = {
      getUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [azure] }, error: null }),
      unlinkIdentity: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }

    await expect(
      reconcileMicrosoftIdentity(auth as never, 'staff@piyamtravel.com'),
    ).resolves.toEqual({ status: 'mismatch-removed' })
    expect(auth.unlinkIdentity).toHaveBeenCalledWith(azure)
  })

  it('fails visibly when a mismatched identity cannot be removed', async () => {
    const azure = identity('azure', 'another.user@piyamtravel.com')
    const auth = {
      getUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [azure] }, error: null }),
      unlinkIdentity: vi.fn().mockResolvedValue({ data: null, error: new Error('provider error') }),
    }

    await expect(
      reconcileMicrosoftIdentity(auth as never, 'staff@piyamtravel.com'),
    ).resolves.toEqual({ status: 'review-required' })
  })

  it('returns useful setup and duplicate-account errors', () => {
    expect(getMicrosoftLinkErrorMessage({ code: 'manual_linking_disabled' })).toContain(
      'not enabled',
    )
    expect(getMicrosoftLinkErrorMessage(new Error('Identity already linked'))).toContain(
      'already linked',
    )
  })
})
