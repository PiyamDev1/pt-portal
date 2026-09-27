import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown[] | null; error: { message: string } | null }> =
    {}
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const requireAccountingAccess = vi.fn()
  const getServiceSupabaseClient = vi.fn()

  const from = vi.fn((table: string) => {
    const query = {
      select(columns: string) {
        calls.push({ table, op: 'select', args: [columns] })
        return query
      },
      is(column: string, value: unknown) {
        calls.push({ table, op: 'is', args: [column, value] })
        return query
      },
      gte(column: string, value: unknown) {
        calls.push({ table, op: 'gte', args: [column, value] })
        return query
      },
      lt(column: string, value: unknown) {
        calls.push({ table, op: 'lt', args: [column, value] })
        return query
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: 'eq', args: [column, value] })
        return query
      },
      order(column: string, options: unknown) {
        calls.push({ table, op: 'order', args: [column, options] })
        return query
      },
      limit(value: number) {
        calls.push({ table, op: 'limit', args: [value] })
        return Promise.resolve(tableData[table] || { data: [], error: null })
      },
      range(start: number, end: number) {
        calls.push({ table, op: 'range', args: [start, end] })
        return Promise.resolve(tableData[table] || { data: [], error: null })
      },
    }
    return query
  })

  return { calls, from, getServiceSupabaseClient, requireAccountingAccess, tableData }
})

vi.mock('@/lib/accounting/access', () => ({
  requireAccountingAccess: mocks.requireAccountingAccess,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET } from '@/app/api/accounting/ticketing/route'

describe('GET /api/accounting/ticketing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.length = 0
    for (const key of Object.keys(mocks.tableData)) delete mocks.tableData[key]
    mocks.requireAccountingAccess.mockResolvedValue({
      authorized: true,
      supabase: { from: vi.fn() },
      user: { id: 'user-1' },
      employee: { id: 'employee-1', role: 'Accounting', departments: ['Accounting'] },
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.tableData.locations = {
      data: [
        { id: 'location-1', name: 'Head Office', branch_code: 'HQ-001' },
        { id: 'location-2', name: 'Luton Office', branch_code: 'UK001' },
      ],
      error: null,
    }
  })

  it('loads ticket totals from fare lines and assigns them to the booking location', async () => {
    mocks.tableData.ticket_transactions = {
      data: [
        {
          id: 'transaction-1',
          booking_id: 'booking-1',
          service_type: 'TK',
          operational_status: 'issued',
          payment_status: 'paid',
          booking_date: '2026-03-12',
          passenger_ticket_count: 2,
          ticket_bookings: {
            id: 'booking-1',
            location_id: 'location-1',
            pnr: 'ABC123',
            customer_name: 'Test Customer',
            archived_at: null,
            airlines: { iata_code: 'EY', name: 'Etihad Airways' },
          },
          responsible_employee: { full_name: 'Agent One' },
          ticket_passenger_fare_lines: [
            { sale_total_gbp: 700, supplier_total_gbp: 620 },
            { sale_total_gbp: 240, supplier_total_gbp: 212.99 },
          ],
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request(
        'http://localhost/api/accounting/ticketing?year=2026&branchId=location-1&service=TK',
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.branches).toHaveLength(2)
    expect(payload.sections).toHaveLength(1)
    expect(payload.sections[0]).toMatchObject({
      branch: { id: 'location-1', name: 'Head Office' },
      transactions: 1,
      passengerTickets: 2,
      saleGbp: 940,
      supplierCostGbp: 832.99,
      grossProfitGbp: 107.01,
    })
    expect(payload.sections[0].rows[0].tickets[0]).toMatchObject({
      pnr: 'ABC123',
      ownerName: 'Agent One',
      branchId: 'location-1',
    })
    expect(mocks.calls).toContainEqual({
      table: 'ticket_transactions',
      op: 'eq',
      args: ['ticket_bookings.location_id', 'location-1'],
    })
    expect(mocks.calls).toContainEqual({
      table: 'ticket_transactions',
      op: 'eq',
      args: ['service_type', 'TK'],
    })
  })

  it('rejects a stale branch selector before querying ticketing data', async () => {
    const response = await GET(
      new Request('http://localhost/api/accounting/ticketing?year=2026&branchId=missing'),
    )

    expect(response.status).toBe(404)
    expect((await response.json()).error).toContain('selected branch')
    expect(mocks.from).not.toHaveBeenCalledWith('ticket_transactions')
  })

  it('requires Accounting access', async () => {
    mocks.requireAccountingAccess.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/accounting/ticketing'))

    expect(response.status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
