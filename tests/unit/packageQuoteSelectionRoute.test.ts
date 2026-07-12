import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Sales Mode Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
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
  const selectSingle = vi.fn()
  const selectEq = vi.fn(() => ({ single: selectSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    selectSingle,
    selectEq,
    select,
    updateEq,
    update,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/packages/[id]/selection/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/packages/quote-1/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/packages/[id]/selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.selectSingle.mockResolvedValue({
      data: { id: 'quote-1', status: 'shared', payload },
      error: null,
    })
    mocks.updateEq.mockResolvedValue({ error: null })
  })

  it('requires an authenticated agent', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await POST(makeRequest({ stayOptionIds: { makkah: 'hotel-a' } }) as never, {
      params: Promise.resolve({ id: 'quote-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('finalises a quote selection and stores customer details', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        customerName: 'A Khan',
        customerPhone: '+447000000000',
        customerEmail: 'a@example.com',
        note: 'Finalised in office',
      }) as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selected.combination.totalPrice).toBe(1000)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_name: 'A Khan',
        customer_phone: '+447000000000',
        customer_email: 'a@example.com',
        selection_note: 'Finalised in office',
        selected_option: expect.objectContaining({
          selection: expect.objectContaining({
            stayOptionIds: { makkah: 'hotel-a' },
          }),
        }),
      }),
    )
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'quote-1')
  })
})
