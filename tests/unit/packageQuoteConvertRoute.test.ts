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

  const employeeMaybeSingle = vi.fn(async () => ({ data: { id: 'agent-1' }, error: null }))
  const employeeEq = vi.fn(() => ({ maybeSingle: employeeMaybeSingle }))
  const employeeSelect = vi.fn(() => ({ eq: employeeEq }))

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
    if (table === 'employees') return { select: employeeSelect }
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
    employeeMaybeSingle,
    employeeEq,
    employeeSelect,
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

  it.each([
    ['malformed JSON', '{"groupCustomerFile":'],
    ['a wrong field type', JSON.stringify({ groupCustomerFile: 'yes' })],
    ['an unknown field', JSON.stringify({ groupCustomerFile: false, unexpected: true })],
  ])('rejects %s in the conversion request body', async (_label, body) => {
    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }) as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: 'Invalid conversion request body' }),
    )
    expect(mocks.quoteSelect).not.toHaveBeenCalled()
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

  it('preserves the quotation code when creating the package reference', async () => {
    mocks.quoteSingle.mockResolvedValueOnce({
      data: {
        ...quote,
        title: 'H29GPX - Umrah Quotation 31 Jul 2026',
        payload: {
          ...payload,
          title: 'H29GPX - Umrah Quotation 31 Jul 2026',
        },
      },
      error: null,
    })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(201)
    expect(mocks.packageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_reference: 'PT-H29GPX',
        minio_prefix: 'PT-H29GPX/',
      }),
    )
  })

  it('assigns converted packages to the agent who finalised the quote', async () => {
    mocks.employeeMaybeSingle.mockResolvedValueOnce({
      data: { id: 'sales-agent-2' },
      error: null,
    })
    mocks.quoteSingle.mockResolvedValueOnce({
      data: {
        ...quote,
        finalised_by: 'sales-agent-2',
      },
      error: null,
    })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      {
        params: Promise.resolve({ id: 'quote-1' }),
      },
    )

    expect(response.status).toBe(201)
    expect(mocks.packageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_agent_id: 'sales-agent-2',
        sales_employee_id: 'sales-agent-2',
      }),
    )
  })

  it('creates separate reservation rows for the main and linked flight legs', async () => {
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
    const flightRows = reservationRows.filter((row) => row.reservation_type === 'flight')
    expect(flightRows).toHaveLength(2)
    expect(flightRows[0]).toEqual(
      expect.objectContaining({
        title: 'Flight - Main flight',
        sold_price_total: 200,
        metadata: expect.objectContaining({ flightPart: 'main' }),
      }),
    )
    expect(flightRows[1]).toEqual(
      expect.objectContaining({
        title: 'Flight leg - Madinah to London',
        sold_price_total: 100,
        metadata: expect.objectContaining({
          flightPart: 'linked_leg',
          linkedFlightSelection: expect.objectContaining({
            groupId: 'return-leg',
            optionId: 'included-return',
          }),
        }),
      }),
    )
    expect(reservationRows.some((row) => row.title === 'Package pricing adjustment')).toBe(false)
  })

  it('converts a previous refund adjustment into account credit without discounting revenue', async () => {
    const creditPayload: PackageQuotePayload = {
      ...payload,
      limitedTimeOffers: [
        {
          id: 'refund-credit',
          title: 'Previous refund balance',
          summary: 'Balance transferred from cancelled package.',
          expiresAt: '',
          discountAmount: 150,
          discountMode: 'total',
          discountType: 'refund_adjustment',
          eligibleServices: [],
          reference: 'PT-OLD123',
          active: true,
        },
      ],
    }
    const creditQuote: TravelPackageQuote = {
      ...quote,
      payload: creditPayload,
      selected_option: resolvePackageSelection(creditPayload, {
        stayOptionIds: { makkah: 'hotel-a' },
        paymentMethod: 'bank_transfer',
      }),
    }
    mocks.quoteSingle.mockResolvedValueOnce({ data: creditQuote, error: null })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert') as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )

    expect(response.status).toBe(201)
    const reservationRows = mocks.reservationInsert.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >
    expect(reservationRows.some((row) => Number(row.discount_total || 0) > 0)).toBe(false)
    expect(mocks.paymentInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 150,
          payment_type: 'account_credit',
          payment_status: 'completed',
          receipt_reference: 'PT-OLD123',
        }),
        expect.objectContaining({
          amount: 850,
          payment_type: 'payment',
          payment_method: 'bank_transfer',
        }),
      ]),
    )
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
