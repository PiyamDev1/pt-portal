import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const packageSingle = vi.fn()
  const existingInvoiceLimit = vi.fn()
  const reservationOrder = vi.fn()
  const reservationQuoteEq = vi.fn(() => ({ order: reservationOrder }))
  const reservationPackageEq = vi.fn(() => ({ eq: reservationQuoteEq }))
  const itemOrder = vi.fn()
  const paymentSelectResult = vi.fn()
  const paymentQuoteEq = vi.fn(() => paymentSelectResult())
  const paymentPackageEq = vi.fn(() => ({ eq: paymentQuoteEq }))
  const paymentAssignmentIs = vi.fn()
  const paymentAssignmentQuoteEq = vi.fn(() => ({ is: paymentAssignmentIs }))
  const paymentAssignmentPackageEq = vi.fn(() => ({ eq: paymentAssignmentQuoteEq }))
  const invoiceInsert = vi.fn()
  const invoiceInsertSingle = vi.fn()
  const invoiceLineInsert = vi.fn()
  const packageUpdateEq = vi.fn()

  const invoiceSelect = vi.fn(() => {
    const query = {
      eq: vi.fn(() => query),
      neq: vi.fn(() => query),
      order: vi.fn(() => ({ limit: existingInvoiceLimit })),
    }
    return query
  })

  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') {
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: packageSingle })) })),
        update: vi.fn(() => ({ eq: packageUpdateEq })),
      }
    }
    if (table === 'travel_package_invoices') {
      return { select: invoiceSelect, insert: invoiceInsert }
    }
    if (table === 'travel_package_reservations') {
      return { select: vi.fn(() => ({ eq: reservationPackageEq })) }
    }
    if (table === 'travel_package_reservation_items') {
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ order: itemOrder })) })),
      }
    }
    if (table === 'travel_package_payments') {
      return {
        select: vi.fn(() => ({ eq: paymentPackageEq })),
        update: vi.fn(() => ({ eq: paymentAssignmentPackageEq })),
      }
    }
    if (table === 'travel_package_invoice_lines') return { insert: invoiceLineInsert }
    return {}
  })

  return {
    getUser,
    packageSingle,
    existingInvoiceLimit,
    reservationOrder,
    reservationQuoteEq,
    itemOrder,
    paymentSelectResult,
    paymentQuoteEq,
    paymentAssignmentIs,
    paymentAssignmentQuoteEq,
    invoiceInsert,
    invoiceInsertSingle,
    invoiceLineInsert,
    packageUpdateEq,
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

import { POST } from '@/app/api/travel-packages/[id]/invoice/route'

describe('group family invoice route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } } })
    mocks.packageSingle.mockResolvedValue({
      data: {
        id: 'package-1',
        package_reference: 'PT-GRP123',
        source_quote_id: 'quote-1',
        group_id: 'group-1',
        customer_file_mode: 'group',
        invoice_status: 'not_started',
      },
      error: null,
    })
    mocks.existingInvoiceLimit.mockResolvedValue({ data: [], error: null })
    mocks.reservationOrder.mockResolvedValue({
      data: [
        {
          id: 'reservation-2',
          package_id: 'package-1',
          quote_id: 'quote-2',
          group_member_id: 'member-2',
          reservation_type: 'hotel',
          title: 'Family 2 - Hotel',
          currency: 'GBP',
          sold_price_total: 2500,
          booked_cost_total: 1900,
          discount_total: 100,
          commission_expected_total: 0,
          commission_received_total: 0,
          customer_refund_total: 0,
        },
      ],
      error: null,
    })
    mocks.itemOrder.mockResolvedValue({ data: [], error: null })
    mocks.paymentSelectResult.mockResolvedValue({
      data: [{ amount: 500, payment_type: 'deposit', payment_status: 'completed' }],
      error: null,
    })
    mocks.invoiceInsertSingle.mockResolvedValue({
      data: {
        id: 'invoice-2',
        package_id: 'package-1',
        quote_id: 'quote-2',
        group_member_id: 'member-2',
        invoice_number: 'INV-PT-GRP123-F2',
        status: 'draft',
      },
      error: null,
    })
    mocks.invoiceInsert.mockReturnValue({
      select: vi.fn(() => ({ single: mocks.invoiceInsertSingle })),
    })
    mocks.invoiceLineInsert.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    mocks.paymentAssignmentIs.mockResolvedValue({ error: null })
    mocks.packageUpdateEq.mockResolvedValue({ error: null })
  })

  it('creates the invoice from only the selected family records', async () => {
    const response = await POST(
      new Request('http://localhost/api/travel-packages/package-1/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: 'quote-2', familyLabel: 'Family 2' }),
      }) as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )

    expect(response.status).toBe(201)
    expect(mocks.reservationQuoteEq).toHaveBeenCalledWith('quote_id', 'quote-2')
    expect(mocks.paymentQuoteEq).toHaveBeenCalledWith('quote_id', 'quote-2')
    expect(mocks.paymentAssignmentQuoteEq).toHaveBeenCalledWith('quote_id', 'quote-2')
    expect(mocks.invoiceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'package-1',
        quote_id: 'quote-2',
        group_member_id: 'member-2',
        subtotal_sold: 2500,
        discount_total: 100,
        total_sold: 2400,
        total_paid: 500,
        balance_due: 1900,
        metadata: expect.objectContaining({ familyLabel: 'Family 2' }),
      }),
    )
  })
})
