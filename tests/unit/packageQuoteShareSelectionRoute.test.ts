import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Shared Customer Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 1,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [{ id: 'hotel-a', title: 'Hotel A', summary: 'Hotel A', price: 1200 }],
    },
  ],
  flightOptions: [],
  visaOptions: [],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

const mocks = vi.hoisted(() => {
  const quoteSingle = vi.fn()
  const quoteQuery = {
    eq: vi.fn(),
    neq: vi.fn(),
    single: quoteSingle,
  }
  quoteQuery.eq.mockReturnValue(quoteQuery)
  quoteQuery.neq.mockReturnValue(quoteQuery)

  const updateEq = vi.fn()
  const select = vi.fn(() => quoteQuery)
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  const getServiceSupabaseClient = vi.fn(() => ({ from }))

  return {
    quoteSingle,
    updateEq,
    select,
    update,
    from,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/packages/share/[token]/selection/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/packages/share/share-token/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/packages/share/[token]/selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.quoteSingle.mockResolvedValue({
      data: {
        id: 'quote-share',
        payload,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.updateEq.mockResolvedValue({ error: null })
  })

  it('stores customer-entered contact details from a shared quote selection', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        customerName: 'Customer One',
        customerPhone: '+447111111111',
        customerEmail: 'customer@example.com',
        note: 'Please call after 5pm',
        termsAccepted: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selected.combination.totalPrice).toBe(1200)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_name: 'Customer One',
        customer_phone: '+447111111111',
        customer_email: 'customer@example.com',
        selection_note: 'Please call after 5pm',
      }),
    )
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'quote-share')
  })
})
