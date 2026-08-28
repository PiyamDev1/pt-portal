import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const packageSingle = vi.fn()
  const familyMaybeSingle = vi.fn()
  const passengerInsert = vi.fn()
  const passengerSingle = vi.fn()
  const paymentInsert = vi.fn()
  const paymentSingle = vi.fn()

  const familySelect = vi.fn(() => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: familyMaybeSingle,
    }
    return query
  })
  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: packageSingle })) })) }
    }
    if (table === 'travel_package_group_members') return { select: familySelect }
    if (table === 'travel_package_passengers') {
      return {
        insert: passengerInsert,
      }
    }
    if (table === 'travel_package_payments') {
      return {
        insert: paymentInsert,
      }
    }
    return {}
  })

  return {
    getUser,
    packageSingle,
    familyMaybeSingle,
    passengerInsert,
    passengerSingle,
    paymentInsert,
    paymentSingle,
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
vi.mock('@/lib/packagePaymentsServer', () => ({
  syncPackagePaymentFinancials: vi.fn(async () => ({ paymentSummary: {} })),
}))

import { POST as createPassenger } from '@/app/api/travel-packages/[id]/passengers/route'
import { POST as createPayment } from '@/app/api/travel-packages/[id]/payments/route'

describe('group package operational ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } } })
    mocks.packageSingle.mockResolvedValue({
      data: { group_id: 'group-1', customer_file_mode: 'group' },
      error: null,
    })
    mocks.familyMaybeSingle.mockResolvedValue({ data: { id: 'member-2' }, error: null })
    mocks.passengerSingle.mockResolvedValue({
      data: {
        id: 'passenger-2',
        package_id: 'package-1',
        quote_id: 'quote-2',
        group_member_id: 'member-2',
        passenger_type: 'adult',
      },
      error: null,
    })
    mocks.passengerInsert.mockReturnValue({
      select: vi.fn(() => ({ single: mocks.passengerSingle })),
    })
    mocks.paymentSingle.mockResolvedValue({
      data: {
        id: 'payment-2',
        package_id: 'package-1',
        quote_id: 'quote-2',
        group_member_id: 'member-2',
        amount: 500,
      },
      error: null,
    })
    mocks.paymentInsert.mockReturnValue({
      select: vi.fn(() => ({ single: mocks.paymentSingle })),
    })
  })

  it('assigns a manually added passenger to the selected family', async () => {
    const response = await createPassenger(
      new Request('http://localhost/api/travel-packages/package-1/passengers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passengerType: 'adult',
          quoteId: 'quote-2',
          groupMemberId: 'member-2',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )

    expect(response.status).toBe(201)
    expect(mocks.passengerInsert).toHaveBeenCalledWith(
      expect.objectContaining({ quote_id: 'quote-2', group_member_id: 'member-2' }),
    )
  })

  it('assigns a manually recorded payment to the selected family', async () => {
    const response = await createPayment(
      new Request('http://localhost/api/travel-packages/package-1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          currency: 'GBP',
          paymentType: 'payment',
          paymentMethod: 'bank_transfer',
          paymentStatus: 'completed',
          quoteId: 'quote-2',
          groupMemberId: 'member-2',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )

    expect(response.status).toBe(201)
    expect(mocks.paymentInsert).toHaveBeenCalledWith(
      expect.objectContaining({ quote_id: 'quote-2', group_member_id: 'member-2' }),
    )
  })
})
