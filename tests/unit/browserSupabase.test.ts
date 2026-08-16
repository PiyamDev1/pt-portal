import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ auth: { experimental: true } })),
}))

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createBrowserClient: mocks.createBrowserClient,
}))

import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'

describe('passkey-capable browser Supabase client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  })

  it('enables native passkeys on a module-owned singleton', () => {
    const first = getBrowserSupabaseClient()
    const second = getBrowserSupabaseClient()

    expect(first).toBe(second)
    expect(mocks.createBrowserClient).toHaveBeenCalledOnce()
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-test-key',
      {
        auth: { experimental: { passkey: true } },
        isSingleton: true,
      },
    )
  })
})
