import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePackageQuotePayload } from '@/lib/packageQuote'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const groupSingle = vi.fn()
  const membersEq = vi.fn()
  const quotesIn = vi.fn()
  const quoteUpdate = vi.fn()
  const quoteUpdateEq = vi.fn()
  const groupUpdate = vi.fn()
  const groupUpdateEq = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_groups') {
      const selectQuery = { eq: vi.fn(), single: groupSingle }
      selectQuery.eq.mockReturnValue(selectQuery)
      return {
        select: vi.fn(() => selectQuery),
        update: groupUpdate.mockReturnValue({ eq: groupUpdateEq }),
      }
    }

    if (table === 'travel_package_group_members') {
      return {
        select: vi.fn(() => ({ eq: membersEq })),
      }
    }

    if (table === 'travel_package_quotes') {
      return {
        select: vi.fn(() => ({ in: quotesIn })),
        update: quoteUpdate.mockReturnValue({ eq: quoteUpdateEq }),
      }
    }

    throw new Error(`Unexpected table ${table}`)
  })

  return {
    getUser,
    groupSingle,
    membersEq,
    quotesIn,
    quoteUpdate,
    quoteUpdateEq,
    groupUpdate,
    groupUpdateEq,
    from,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}))

import { POST } from '@/app/api/travel-package-groups/[id]/flights/route'

function request(body: unknown) {
  return new Request('http://localhost/api/travel-package-groups/group-1/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/travel-package-groups/[id]/flights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.groupSingle.mockResolvedValue({
      data: {
        id: 'group-1',
        metadata: { existing: true },
        customer_visibility_mode: 'linked_notice_only',
      },
      error: null,
    })
    mocks.membersEq.mockResolvedValue({
      data: [{ quote_id: 'source-quote' }, { quote_id: 'target-quote' }],
      error: null,
    })
    mocks.quoteUpdateEq.mockResolvedValue({ error: null })
    mocks.groupUpdateEq.mockResolvedValue({ error: null })

    const source = normalizePackageQuotePayload({
      title: 'Source family',
      adults: 2,
      flightOptions: [
        {
          id: 'saudi-main',
          title: 'Saudi Airlines',
          summary: 'New shared outbound flight',
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 500,
          childPrice: 420,
          infantPrice: 120,
        },
      ],
      linkedFlightGroups: [
        {
          id: 'return-leg',
          baseFlightOptionId: 'saudi-main',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'wizz-return',
          options: [
            {
              id: 'wizz-return',
              airlineName: 'Wizz Air',
              summary: 'New shared return flight',
              adultPrice: 200,
              childPrice: 180,
              infantPrice: 50,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
          ],
        },
      ],
    })
    const target = normalizePackageQuotePayload({
      title: 'Target family',
      adults: 4,
      flightOptions: [
        {
          ...source.flightOptions[0],
          summary: 'Old outbound flight',
          adultPrice: 640,
          childPrice: 530,
          infantPrice: 175,
        },
      ],
      linkedFlightGroups: [
        {
          ...source.linkedFlightGroups[0],
          options: [
            {
              ...source.linkedFlightGroups[0].options[0],
              summary: 'Old return flight',
              adultPrice: 245,
              childPrice: 210,
              infantPrice: 70,
            },
          ],
        },
      ],
    })
    mocks.quotesIn.mockResolvedValue({
      data: [
        { id: 'source-quote', payload: source },
        { id: 'target-quote', payload: target },
      ],
      error: null,
    })
  })

  it('copies shared flight details and preserves target family seat prices', async () => {
    const response = await POST(
      request({ sourceQuoteId: 'source-quote', enabled: true }) as never,
      {
        params: Promise.resolve({ id: 'group-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(
      expect.objectContaining({ enabled: true, syncedQuoteIds: ['target-quote'], syncedCount: 1 }),
    )
    const quoteUpdate = mocks.quoteUpdate.mock.calls[0][0]
    expect(quoteUpdate).toEqual(
      expect.objectContaining({
        selected_option: null,
        finalised_at: null,
        payload: expect.objectContaining({ title: 'Target family' }),
      }),
    )
    expect(quoteUpdate.payload.flightOptions[0]).toEqual(
      expect.objectContaining({
        summary: 'New shared outbound flight',
        adultPrice: 640,
        childPrice: 530,
        infantPrice: 175,
      }),
    )
    expect(quoteUpdate.payload.linkedFlightGroups[0].options[0]).toEqual(
      expect.objectContaining({
        summary: 'New shared return flight',
        adultPrice: 245,
        childPrice: 210,
        infantPrice: 70,
      }),
    )
    expect(mocks.groupUpdate).toHaveBeenCalledWith({
      metadata: { existing: true, sharedFlightSelection: true },
      updated_by: 'agent-1',
      customer_visibility_mode: 'shared_group_view',
    })
  })

  it('rejects an unauthenticated sync request', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await POST(
      request({ sourceQuoteId: 'source-quote', enabled: true }) as never,
      {
        params: Promise.resolve({ id: 'group-1' }),
      },
    )

    expect(response.status).toBe(401)
    expect(mocks.quoteUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON before loading group data', async () => {
    const invalidRequest = new Request(
      'http://localhost/api/travel-package-groups/group-1/flights',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      },
    )

    const response = await POST(invalidRequest as never, {
      params: Promise.resolve({ id: 'group-1' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Invalid JSON request body' }),
    )
    expect(mocks.groupSingle).not.toHaveBeenCalled()
  })

  it('rejects oversized JSON before loading group data', async () => {
    const response = await POST(
      request({ sourceQuoteId: 'x'.repeat(5_000), enabled: true }) as never,
      { params: Promise.resolve({ id: 'group-1' }) },
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Request body is too large' }),
    )
    expect(mocks.groupSingle).not.toHaveBeenCalled()
  })
})
