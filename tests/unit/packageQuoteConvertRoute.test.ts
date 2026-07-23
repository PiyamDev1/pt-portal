import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload, TravelPackageQuote } from '@/app/types/packages'
import { resolvePackageSelection } from '@/lib/packageQuote'

const payload: PackageQuotePayload = {
  title: 'Converted Umrah Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '2026-09-01',
  returnDate: '2026-09-10',
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

const selectedOption = resolvePackageSelection(payload, {
  stayOptionIds: { makkah: 'hotel-a' },
  customerName: 'A Khan',
  customerPhone: '+447000000000',
  customerEmail: 'a@example.com',
})

const quote: TravelPackageQuote = {
  id: 'quote-1',
  title: payload.title,
  package_type: 'umrah',
  status: 'shared',
  currency: 'GBP',
  customer_name: null,
  customer_phone: null,
  customer_email: null,
  payload,
  share_token: 'token',
  share_enabled: true,
  shared_at: null,
  expires_at: '2999-01-01T00:00:00.000Z',
  selected_option: selectedOption,
  selected_at: '2026-07-11T10:00:00.000Z',
  selection_note: null,
  converted_package_id: null,
  converted_at: null,
  created_by: 'agent-1',
  created_at: '2026-07-11T09:00:00.000Z',
  updated_at: null,
}

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const quoteSingle = vi.fn()
  const quoteEq = vi.fn(() => ({ single: quoteSingle }))
  const quoteSelect = vi.fn(() => ({ eq: quoteEq }))
  const quoteUpdateEq = vi.fn()
  const quoteUpdate = vi.fn(() => ({ eq: quoteUpdateEq }))

  const packageInsertSingle = vi.fn()
  const packageInsertSelect = vi.fn(() => ({ single: packageInsertSingle }))
  const packageInsert = vi.fn(() => ({ select: packageInsertSelect }))
  const packageSingle = vi.fn()
  const packageEq = vi.fn(() => ({ single: packageSingle }))
  const packageSelect = vi.fn(() => ({ eq: packageEq }))

  const taskInsert = vi.fn()
  const communicationInsert = vi.fn()
  const versionInsert = vi.fn()
  const paymentInsert = vi.fn()
  const passengerInsert = vi.fn()
  const reservationInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_quotes') {
      return { select: quoteSelect, update: quoteUpdate }
    }
    if (table === 'travel_packages') {
      return { insert: packageInsert, select: packageSelect }
    }
    if (table === 'travel_package_tasks') return { insert: taskInsert }
    if (table === 'travel_package_communications') return { insert: communicationInsert }
    if (table === 'travel_package_versions') return { insert: versionInsert }
    if (table === 'travel_package_payments') return { insert: paymentInsert }
    if (table === 'travel_package_passengers') return { insert: passengerInsert }
    if (table === 'travel_package_reservations') return { insert: reservationInsert }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    quoteSingle,
    quoteEq,
    quoteSelect,
    quoteUpdateEq,
    quoteUpdate,
    packageInsertSingle,
    packageInsertSelect,
    packageInsert,
    packageSingle,
    packageEq,
    packageSelect,
    taskInsert,
    communicationInsert,
    versionInsert,
    paymentInsert,
    passengerInsert,
    reservationInsert,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/packages/[id]/convert/route'

describe('POST /api/packages/[id]/convert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.quoteSingle.mockResolvedValue({ data: quote, error: null })
    mocks.packageInsertSingle.mockResolvedValue({
      data: {
        id: 'package-1',
        package_reference: 'PT-PKG-2026-ABC123',
        source_quote_id: 'quote-1',
        customer_name: 'A Khan',
        package_type: 'umrah',
        status: 'selected',
        passenger_summary: {},
        selected_quote_snapshot: {},
        current_public_summary: {},
        passport_status: 'not_requested',
        payment_status: 'not_requested',
        invoice_status: 'not_started',
        document_release_status: 'not_started',
        next_action: 'Request passport copies via WhatsApp',
        risk_level: 'medium',
      },
      error: null,
    })
    mocks.taskInsert.mockResolvedValue({ error: null })
    mocks.communicationInsert.mockResolvedValue({ error: null })
    mocks.versionInsert.mockResolvedValue({ error: null })
    mocks.paymentInsert.mockResolvedValue({ error: null })
    mocks.passengerInsert.mockResolvedValue({ error: null })
    mocks.reservationInsert.mockResolvedValue({ error: null })
    mocks.quoteUpdateEq.mockResolvedValue({ error: null })
  })

  it('requires an authenticated agent', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(401)
  })

  it('creates a package folder from a finalised quote', async () => {
    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.package.id).toBe('package-1')
    expect(mocks.packageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_quote_id: 'quote-1',
        customer_name: 'A Khan',
        customer_phone: '+447000000000',
        customer_email: 'a@example.com',
        status: 'selected',
        next_action: 'Request passport copies via WhatsApp',
        risk_level: 'medium',
      }),
    )
    expect(mocks.taskInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'package-1',
        quote_id: 'quote-1',
        title: 'Request passport copies via WhatsApp',
      }),
    )
    expect(mocks.quoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ converted_package_id: 'package-1' }),
    )
  })

  it('adds selected linked flight leg costs to the flight reservation row', async () => {
    const linkedPayload: PackageQuotePayload = {
      ...payload,
      flightOptions: [
        {
          id: 'flight-main',
          title: 'Main flight',
          summary: 'Outbound flight',
          price: 100,
          pricingMode: 'per_person',
        },
      ],
      linkedFlightGroups: [
        {
          id: 'return-leg',
          baseFlightOptionId: 'flight-main',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'included-return',
          options: [
            {
              id: 'included-return',
              airlineName: 'Included return',
              summary: 'Return flight',
              adultPrice: 50,
              childPrice: 50,
              infantPrice: 0,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
          ],
        },
      ],
    }
    const linkedQuote: TravelPackageQuote = {
      ...quote,
      payload: linkedPayload,
      selected_option: resolvePackageSelection(linkedPayload, {
        stayOptionIds: { makkah: 'hotel-a' },
      }),
    }
    mocks.quoteSingle.mockResolvedValueOnce({ data: linkedQuote, error: null })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(201)
    const reservationRows = mocks.reservationInsert.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >
    const flightRow = reservationRows.find((row) => row.reservation_type === 'flight')
    expect(flightRow).toEqual(
      expect.objectContaining({
        sold_price_total: 300,
        metadata: expect.objectContaining({
          linkedFlightSelections: [
            expect.objectContaining({
              groupId: 'return-leg',
              optionId: 'included-return',
            }),
          ],
        }),
      }),
    )
    expect(reservationRows.some((row) => row.title === 'Package pricing adjustment')).toBe(false)
  })

  it('adds card processing fee to full-payment card payment rows', async () => {
    const cardPayload: PackageQuotePayload = {
      ...payload,
      cardProcessingFeePercent: 3,
    }
    const cardQuote: TravelPackageQuote = {
      ...quote,
      payload: cardPayload,
      selected_option: resolvePackageSelection(cardPayload, {
        stayOptionIds: { makkah: 'hotel-a' },
        paymentMethod: 'card',
        customerName: 'A Khan',
      }),
    }
    mocks.quoteSingle.mockResolvedValueOnce({ data: cardQuote, error: null })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(201)
    expect(mocks.paymentInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        amount: 1030,
        payment_type: 'payment',
        payment_method: 'card',
        metadata: expect.objectContaining({
          baseAmount: 1000,
          processingFeeTotal: 30,
          processingFeePercent: 3,
        }),
      }),
    ])
  })

  it('creates a card deposit payment for the deposit plus processing fee', async () => {
    const depositPayload: PackageQuotePayload = {
      ...payload,
      cardProcessingFeePercent: 3,
      depositRequired: true,
      depositAmount: 1000,
    }
    const depositQuote: TravelPackageQuote = {
      ...quote,
      payload: depositPayload,
      selected_option: resolvePackageSelection(depositPayload, {
        stayOptionIds: { makkah: 'hotel-a' },
        paymentIntent: 'deposit_only',
        depositPaymentMethod: 'card',
        customerName: 'A Khan',
      }),
    }
    mocks.quoteSingle.mockResolvedValueOnce({ data: depositQuote, error: null })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(201)
    expect(mocks.paymentInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        amount: 1030,
        payment_type: 'deposit',
        payment_method: 'card',
        metadata: expect.objectContaining({
          baseDepositAmount: 1000,
          processingFeeTotal: 30,
          processingFeePercent: 3,
        }),
      }),
    ])
  })
})
