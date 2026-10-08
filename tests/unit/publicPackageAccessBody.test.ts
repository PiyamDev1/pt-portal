import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServiceSupabaseClient: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { POST as accessPackagePortal } from '@/app/api/package-portal/access/route'
import { POST as accessThirdPartyDocuments } from '@/app/api/package-third-party-documents/[token]/route'

const publicAccessHandlers: {
  label: string
  error: string
  rateLimitedFirst: boolean
  call: (request: Request) => Promise<Response>
}[] = [
  {
    label: 'customer package portal',
    error: 'Invalid request',
    rateLimitedFirst: false,
    call: (request) => accessPackagePortal(request as never),
  },
  {
    label: 'third-party document portal',
    error: 'Invalid JSON body',
    rateLimitedFirst: true,
    call: (request) =>
      accessThirdPartyDocuments(request as never, {
        params: Promise.resolve({ token: 'share-token' }),
      }),
  },
]

describe('public package access request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
  })

  it.each(publicAccessHandlers)(
    'rejects malformed and empty JSON for the $label without database access',
    async ({ call, error, rateLimitedFirst }) => {
      for (const body of ['{', '']) {
        const response = await call(
          new Request('http://localhost/api/package-access', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body || undefined,
          }),
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error })
      }

      expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(rateLimitedFirst ? 2 : 0)
      expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
    },
  )
})
