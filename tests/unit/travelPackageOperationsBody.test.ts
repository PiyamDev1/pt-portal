import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser }, from }))
  return { getUser, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH as patchDocument } from '@/app/api/travel-packages/[id]/documents/[documentId]/route'
import { PATCH as patchDocumentAccess } from '@/app/api/travel-packages/[id]/documents/access/route'
import { POST as createPassenger } from '@/app/api/travel-packages/[id]/passengers/route'
import { PATCH as patchPassenger } from '@/app/api/travel-packages/[id]/passengers/[passengerId]/route'
import { POST as createThirdPartyShare } from '@/app/api/travel-packages/[id]/third-party-document-shares/route'
import { PATCH as revokeThirdPartyShare } from '@/app/api/travel-packages/[id]/third-party-document-shares/[shareId]/route'
import { POST as createTransportVoucher } from '@/app/api/travel-packages/[id]/transport-vouchers/route'
import { PATCH as updateTransportVoucher } from '@/app/api/travel-packages/[id]/transport-vouchers/[voucherId]/route'

const packageParams = { params: Promise.resolve({ id: 'package-1' }) }

const bodyHandlers: {
  label: string
  method: 'POST' | 'PATCH'
  call: (request: Request) => Promise<Response>
}[] = [
  {
    label: 'package document update',
    method: 'PATCH',
    call: (request) =>
      patchDocument(request as never, {
        params: Promise.resolve({ id: 'package-1', documentId: 'document-1' }),
      }),
  },
  {
    label: 'package document access update',
    method: 'PATCH',
    call: (request) => patchDocumentAccess(request as never, packageParams),
  },
  {
    label: 'passenger creation',
    method: 'POST',
    call: (request) => createPassenger(request as never, packageParams),
  },
  {
    label: 'passenger update',
    method: 'PATCH',
    call: (request) =>
      patchPassenger(request as never, {
        params: Promise.resolve({ id: 'package-1', passengerId: 'passenger-1' }),
      }),
  },
  {
    label: 'third-party share creation',
    method: 'POST',
    call: (request) => createThirdPartyShare(request as never, packageParams),
  },
  {
    label: 'third-party share revocation',
    method: 'PATCH',
    call: (request) =>
      revokeThirdPartyShare(request as never, {
        params: Promise.resolve({ id: 'package-1', shareId: 'share-1' }),
      }),
  },
  {
    label: 'transport voucher creation',
    method: 'POST',
    call: (request) => createTransportVoucher(request as never, packageParams),
  },
  {
    label: 'transport voucher update',
    method: 'PATCH',
    call: (request) =>
      updateTransportVoucher(request as never, {
        params: Promise.resolve({ id: 'package-1', voucherId: 'voucher-1' }),
      }),
  },
]

describe('travel-package mutation JSON boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } } })
  })

  it.each(bodyHandlers)(
    'rejects malformed and empty JSON for $label before domain reads or writes',
    async ({ call, method }) => {
      for (const body of ['{', '']) {
        const response = await call(
          new Request('http://localhost/api/travel-packages/package-1', {
            method,
            headers: { 'content-type': 'application/json' },
            body: body || undefined,
          }),
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
      }

      expect(mocks.getRouteSupabaseClient).toHaveBeenCalledTimes(2)
      expect(mocks.getUser).toHaveBeenCalledTimes(2)
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )
})
