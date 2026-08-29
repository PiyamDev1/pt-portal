import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload, TravelPackageQuote } from '@/app/types/packages'
import { resolvePackageSelection } from '@/lib/packageQuote'

const basePayload: PackageQuotePayload = {
  title: 'Family Umrah Quote',
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
      options: [{ id: 'hotel-a', title: 'Hotel A', summary: '', price: 1000 }],
    },
  ],
  flightOptions: [],
  visaOptions: [],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

function familyQuote(id: string, name: string, paymentScope: 'current' | 'group') {
  const selected = resolvePackageSelection(basePayload, {
    stayOptionIds: { makkah: 'hotel-a' },
    customerName: name,
    paymentScope,
    groupPaymentBreakdown:
      paymentScope === 'group' ? { cash: 0, bankTransfer: 2000, card: 0 } : null,
  })
  return {
    id,
    title: `${id} - Umrah quotation`,
    package_type: 'umrah',
    status: 'customer_selected',
    currency: 'GBP',
    customer_name: name,
    customer_phone: '+447000000000',
    customer_email: `${id}@example.com`,
    payload: basePayload,
    share_token: `${id}-token`,
    share_enabled: true,
    shared_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    selected_option: selected,
    selected_at: '2026-08-27T10:00:00.000Z',
    selection_note: null,
    converted_package_id: null,
    converted_at: null,
    finalised_at: '2026-08-27T10:00:00.000Z',
    finalised_by: 'agent-1',
    finalised_source: 'customer',
    created_by: 'agent-1',
    created_at: '2026-08-27T09:00:00.000Z',
    updated_at: null,
  } satisfies TravelPackageQuote
}

const quoteOne = familyQuote('quote-1', 'Lead Family', 'group')
const quoteTwo = familyQuote('quote-2', 'Second Family', 'current')

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const initialQuoteSingle = vi.fn()
  const groupQuoteIn = vi.fn()
  const quoteSelect = vi.fn(() => ({
    eq: vi.fn(() => ({ single: initialQuoteSingle })),
    in: groupQuoteIn,
  }))
  const quoteUpdateIn = vi.fn()
  const quoteUpdate = vi.fn(() => ({ in: quoteUpdateIn, eq: vi.fn() }))

  const membershipMaybeSingle = vi.fn()
  const memberOrder = vi.fn()
  const memberUpdateEq = vi.fn()
  const memberSelect = vi.fn(() => ({
    eq: vi.fn((field: string) =>
      field === 'quote_id' ? { maybeSingle: membershipMaybeSingle } : { order: memberOrder },
    ),
  }))
  const memberUpdate = vi.fn(() => ({ eq: memberUpdateEq }))

  const groupSingle = vi.fn()
  const groupSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: groupSingle })) }))
  const groupUpdateEq = vi.fn()
  const groupUpdate = vi.fn(() => ({ eq: groupUpdateEq }))

  const packageInsertSingle = vi.fn()
  const packageInsert = vi.fn(() => ({
    select: vi.fn(() => ({ single: packageInsertSingle })),
  }))
  const packageSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) }))

  const employeeMaybeSingle = vi.fn()
  const employeeSelect = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: employeeMaybeSingle })),
  }))
  const passengerInsert = vi.fn()
  const reservationInsert = vi.fn()
  const paymentInsert = vi.fn()
  const taskInsert = vi.fn()
  const communicationInsert = vi.fn()
  const versionInsert = vi.fn()
  const deadlineInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_quotes') return { select: quoteSelect, update: quoteUpdate }
    if (table === 'travel_package_group_members') {
      return { select: memberSelect, update: memberUpdate }
    }
    if (table === 'travel_package_groups') return { select: groupSelect, update: groupUpdate }
    if (table === 'travel_packages') return { insert: packageInsert, select: packageSelect }
    if (table === 'employees') return { select: employeeSelect }
    if (table === 'travel_package_passengers') return { insert: passengerInsert }
    if (table === 'travel_package_reservations') return { insert: reservationInsert }
    if (table === 'travel_package_payments') return { insert: paymentInsert }
    if (table === 'travel_package_tasks') return { insert: taskInsert }
    if (table === 'travel_package_communications') return { insert: communicationInsert }
    if (table === 'travel_package_versions') return { insert: versionInsert }
    if (table === 'travel_package_deadlines') return { insert: deadlineInsert }
    return {}
  })

  return {
    getUser,
    initialQuoteSingle,
    groupQuoteIn,
    quoteUpdateIn,
    membershipMaybeSingle,
    memberOrder,
    memberUpdateEq,
    groupSingle,
    groupUpdate,
    groupUpdateEq,
    packageInsert,
    packageInsertSingle,
    employeeMaybeSingle,
    passengerInsert,
    reservationInsert,
    paymentInsert,
    taskInsert,
    communicationInsert,
    versionInsert,
    deadlineInsert,
    from,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}))

vi.mock('@/lib/packageAudit', () => ({ recordPackageAuditEvent: vi.fn() }))

import { POST } from '@/app/api/packages/[id]/convert/route'

describe('group customer file conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.initialQuoteSingle.mockResolvedValue({ data: quoteOne, error: null })
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { id: 'member-1', group_id: 'group-1' },
      error: null,
    })
    mocks.groupSingle.mockResolvedValue({
      data: {
        id: 'group-1',
        group_reference: 'PTG-GRP123',
        title: 'Together Group',
        lead_quote_id: 'quote-1',
        lead_package_id: null,
        customer_package_id: null,
        customer_file_mode: 'combined',
      },
      error: null,
    })
    mocks.memberOrder.mockResolvedValue({
      data: [
        {
          id: 'member-1',
          group_id: 'group-1',
          quote_id: 'quote-1',
          family_label: 'Family 1',
          is_lead_family: true,
          sort_order: 10,
        },
        {
          id: 'member-2',
          group_id: 'group-1',
          quote_id: 'quote-2',
          family_label: 'Family 2',
          is_lead_family: false,
          sort_order: 20,
        },
      ],
      error: null,
    })
    mocks.groupQuoteIn.mockResolvedValue({ data: [quoteOne, quoteTwo], error: null })
    mocks.employeeMaybeSingle.mockResolvedValue({ data: { id: 'agent-1' }, error: null })
    mocks.packageInsertSingle.mockResolvedValue({
      data: {
        id: 'package-group-1',
        package_reference: 'PT-GRP123',
        source_quote_id: 'quote-1',
        group_id: 'group-1',
        customer_file_mode: 'group',
        departure_date: '2026-09-01',
        return_date: '2026-09-10',
      },
      error: null,
    })
    ;[
      mocks.passengerInsert,
      mocks.reservationInsert,
      mocks.paymentInsert,
      mocks.taskInsert,
      mocks.communicationInsert,
      mocks.versionInsert,
      mocks.deadlineInsert,
      mocks.quoteUpdateIn,
      mocks.groupUpdateEq,
      mocks.memberUpdateEq,
    ].forEach((mock) => mock.mockResolvedValue({ error: null }))
  })

  it('creates one folder while retaining family financial ownership', async () => {
    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCustomerFile: true }),
      }) as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )

    expect(response.status).toBe(201)
    expect(mocks.packageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_reference: 'PT-GRP123',
        group_id: 'group-1',
        customer_file_mode: 'group',
        passenger_summary: expect.objectContaining({ totalPassengers: 4 }),
        selected_quote_snapshot: expect.objectContaining({
          group: expect.objectContaining({
            id: 'group-1',
            families: expect.arrayContaining([
              expect.objectContaining({ quoteId: 'quote-1', familyLabel: 'Family 1' }),
              expect.objectContaining({ quoteId: 'quote-2', familyLabel: 'Family 2' }),
            ]),
          }),
        }),
      }),
    )

    const passengerRows = mocks.passengerInsert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(passengerRows).toHaveLength(4)
    expect(passengerRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quote_id: 'quote-1', group_member_id: 'member-1' }),
        expect.objectContaining({ quote_id: 'quote-2', group_member_id: 'member-2' }),
      ]),
    )

    const reservationRows = mocks.reservationInsert.mock.calls[0][0] as Array<
      Record<string, unknown>
    >
    expect(reservationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quote_id: 'quote-1',
          title: 'Family 1 - Makkah hotel - Hotel A',
        }),
        expect.objectContaining({
          quote_id: 'quote-2',
          title: 'Family 2 - Makkah hotel - Hotel A',
        }),
      ]),
    )

    const paymentRows = mocks.paymentInsert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(paymentRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quote_id: 'quote-1', amount: 1000 }),
        expect.objectContaining({ quote_id: 'quote-2', amount: 1000 }),
      ]),
    )
    expect(mocks.quoteUpdateIn).toHaveBeenCalledWith('id', ['quote-1', 'quote-2'])
    expect(mocks.groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_package_id: 'package-group-1',
        customer_file_mode: 'combined',
        status: 'finalised',
      }),
    )
  })

  it('records shared transport sales per family and supplier cost once for the group', async () => {
    const transportPayload: PackageQuotePayload = {
      ...basePayload,
      transportOptions: [
        {
          id: 'shared-transport',
          title: 'Option 1',
          summary: 'Jeddah Airport to Makkah Hotel',
          price: 200,
          pricingMode: 'total',
          transportNetCost: 300,
          transportNetCurrency: 'GBP',
          transportMainSupplierName: 'Operations Supplier',
          transportRoutes: [],
        },
      ],
    }
    const createTransportQuote = (id: string, name: string) => ({
      ...familyQuote(id, name, 'current'),
      payload: transportPayload,
      selected_option: resolvePackageSelection(transportPayload, {
        stayOptionIds: { makkah: 'hotel-a' },
        transportOptionId: 'shared-transport',
        customerName: name,
      }),
    })
    mocks.groupQuoteIn.mockResolvedValue({
      data: [
        createTransportQuote('quote-1', 'Lead Family'),
        createTransportQuote('quote-2', 'Second Family'),
      ],
      error: null,
    })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCustomerFile: true }),
      }) as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )

    expect(response.status).toBe(201)
    const reservationRows = mocks.reservationInsert.mock.calls[0][0] as Array<
      Record<string, unknown>
    >
    const transportRows = reservationRows.filter((row) => row.reservation_type === 'transport')
    const familyAllocations = transportRows.filter((row) => row.quote_id)
    const physicalReservations = transportRows.filter((row) => !row.quote_id)

    expect(familyAllocations).toHaveLength(2)
    expect(familyAllocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quote_id: 'quote-1',
          booked_cost_total: 0,
          sold_price_total: 200,
        }),
        expect.objectContaining({
          quote_id: 'quote-2',
          booked_cost_total: 0,
          sold_price_total: 200,
        }),
      ]),
    )
    expect(physicalReservations).toEqual([
      expect.objectContaining({
        title: 'Group main transport',
        booked_cost_total: 0,
        sold_price_total: 400,
        supplier_name: 'Operations Supplier',
        metadata: expect.objectContaining({
          sharedGroupTransport: true,
          physicalReservation: true,
        }),
      }),
    ])
  })

  it('does not convert while a linked family only has a saved draft selection', async () => {
    mocks.groupQuoteIn.mockResolvedValue({
      data: [
        quoteOne,
        {
          ...quoteTwo,
          status: 'shared',
          finalised_at: null,
          selected_at: '2026-08-27T10:00:00.000Z',
        },
      ],
      error: null,
    })

    const response = await POST(
      new Request('http://localhost/api/packages/quote-1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCustomerFile: true }),
      }) as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Family 2 must save and finalise'),
      }),
    )
    expect(mocks.packageInsert).not.toHaveBeenCalled()
  })
})
