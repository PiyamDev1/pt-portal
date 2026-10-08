import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return { getUser, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/packageAudit', () => ({ recordPackageAuditEvent: vi.fn() }))
vi.mock('@/lib/packageInvoiceServer', () => ({ recalculatePackageInvoice: vi.fn() }))

import {
  POST as createInvoice,
  PATCH as updateInvoice,
} from '@/app/api/travel-packages/[id]/invoice/route'
import { POST as releaseInvoice } from '@/app/api/travel-packages/[id]/invoice/release/route'
import { POST as amendInvoice } from '@/app/api/travel-packages/[id]/invoice/amend/route'
import { POST as createInvoiceLine } from '@/app/api/travel-packages/[id]/invoice/lines/route'
import { PATCH as updateInvoiceLine } from '@/app/api/travel-packages/[id]/invoice/lines/[lineId]/route'

const packageParams = { params: Promise.resolve({ id: 'package-1' }) }
const invoiceLineParams = {
  params: Promise.resolve({ id: 'package-1', lineId: 'line-1' }),
}

type BodyRouteCase = {
  name: string
  url: string
  method: 'POST' | 'PATCH'
  invoke: (request: Request) => Promise<Response>
}

const routes: BodyRouteCase[] = [
  {
    name: 'invoice creation',
    url: 'http://localhost/api/travel-packages/package-1/invoice',
    method: 'POST',
    invoke: (request) => createInvoice(request as never, packageParams),
  },
  {
    name: 'invoice update',
    url: 'http://localhost/api/travel-packages/package-1/invoice',
    method: 'PATCH',
    invoke: (request) => updateInvoice(request as never, packageParams),
  },
  {
    name: 'invoice release',
    url: 'http://localhost/api/travel-packages/package-1/invoice/release',
    method: 'POST',
    invoke: (request) => releaseInvoice(request as never, packageParams),
  },
  {
    name: 'invoice amendment',
    url: 'http://localhost/api/travel-packages/package-1/invoice/amend',
    method: 'POST',
    invoke: (request) => amendInvoice(request as never, packageParams),
  },
  {
    name: 'invoice line creation',
    url: 'http://localhost/api/travel-packages/package-1/invoice/lines',
    method: 'POST',
    invoke: (request) => createInvoiceLine(request as never, packageParams),
  },
  {
    name: 'invoice line update',
    url: 'http://localhost/api/travel-packages/package-1/invoice/lines/line-1',
    method: 'PATCH',
    invoke: (request) => updateInvoiceLine(request as never, invoiceLineParams),
  },
]

describe('package invoice write request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each(routes)('rejects malformed JSON for $name before invoice access', async (route) => {
    const response = await route.invoke(
      new Request(route.url, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    [
      'invoice update',
      updateInvoice,
      'http://localhost/api/travel-packages/package-1/invoice',
      'PATCH',
    ],
    [
      'invoice release',
      releaseInvoice,
      'http://localhost/api/travel-packages/package-1/invoice/release',
      'POST',
    ],
  ] as const)(
    'keeps empty %s requests at the existing missing-invoice guard',
    async (_name, handler, url, method) => {
      const response = await handler(new Request(url, { method }) as never, packageParams)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invoice ID is required' })
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'invoice amendment',
      amendInvoice,
      'http://localhost/api/travel-packages/package-1/invoice/amend',
    ],
    [
      'invoice line creation',
      createInvoiceLine,
      'http://localhost/api/travel-packages/package-1/invoice/lines',
    ],
    [
      'invoice line update',
      updateInvoiceLine,
      'http://localhost/api/travel-packages/package-1/invoice/lines/line-1',
    ],
  ] as const)('rejects an empty %s request before invoice access', async (_name, handler, url) => {
    const params = url.endsWith('line-1') ? invoiceLineParams : packageParams
    const method = url.endsWith('line-1') ? 'PATCH' : 'POST'
    const response = await handler(new Request(url, { method }) as never, params)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
