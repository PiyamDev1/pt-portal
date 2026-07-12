import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Editable Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'A Khan',
  customerPhone: '+447000000000',
  customerEmail: 'a@example.com',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  itineraryOrder: ['makkah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [{ id: 'hotel-a', title: 'Hotel A', summary: 'Hotel A', price: 1000 }],
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
  const getUser = vi.fn()
  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ update }))
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    updateSingle,
    updateSelect,
    updateEq,
    update,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH } from '@/app/api/packages/[id]/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/packages/quote-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/packages/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.updateSingle.mockResolvedValue({
      data: {
        id: 'quote-1',
        title: payload.title,
        package_type: 'umrah',
        status: 'draft',
        currency: 'GBP',
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail,
        payload,
        share_token: 'token',
        share_enabled: false,
        shared_at: null,
        expires_at: '2999-01-01T00:00:00.000Z',
        selected_option: null,
        selected_at: null,
        selection_note: null,
        converted_package_id: null,
        converted_at: null,
        created_by: 'agent-1',
        created_at: '2026-07-12T00:00:00.000Z',
        updated_at: '2026-07-12T00:00:00.000Z',
      },
      error: null,
    })
  })

  it('clears an existing customer selection when quote payload is edited', async () => {
    const response = await PATCH(makeRequest({ payload, shareEnabled: false }) as never, {
      params: Promise.resolve({ id: 'quote-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ title: 'Editable Quote' }),
        selected_option: null,
        selected_at: null,
        selection_note: null,
      }),
    )
  })
})
