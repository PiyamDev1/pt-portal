import { describe, expect, it, vi } from 'vitest'
import { loadPosSourceOptions } from '@/lib/pos/sourceLookup'

function sourceClient(rowsByTable: Record<string, unknown[]>) {
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const query = {
      select(...args: unknown[]) {
        calls.push({ table, operation: 'select', args })
        return query
      },
      eq(...args: unknown[]) {
        calls.push({ table, operation: 'eq', args })
        return query
      },
      is(...args: unknown[]) {
        calls.push({ table, operation: 'is', args })
        return query
      },
      or(...args: unknown[]) {
        calls.push({ table, operation: 'or', args })
        return query
      },
      ilike(...args: unknown[]) {
        calls.push({ table, operation: 'ilike', args })
        return query
      },
      order(...args: unknown[]) {
        calls.push({ table, operation: 'order', args })
        return query
      },
      limit(...args: unknown[]) {
        calls.push({ table, operation: 'limit', args })
        return Promise.resolve({ data: rowsByTable[table] || [], error: null })
      },
    }
    return query
  })

  return { client: { from } as never, calls, from }
}

describe('POS source lookup', () => {
  it('limits Ticketing results to the operator branch and returns a stable source link', async () => {
    const { client, calls } = sourceClient({
      ticket_bookings: [
        {
          id: 'booking-1',
          pnr: 'ABC123',
          customer_name: 'Aisha Khan',
          operational_status: 'issued',
          payment_status: 'paid',
        },
      ],
    })

    const options = await loadPosSourceOptions(client, {
      sourceType: 'TICKETING',
      query: 'ABC',
      catalogueKey: 'ticketing',
      locationId: 'branch-1',
    })

    expect(calls).toContainEqual({
      table: 'ticket_bookings',
      operation: 'eq',
      args: ['location_id', 'branch-1'],
    })
    expect(options).toEqual([
      {
        sourceType: 'TICKETING',
        namespace: 'ticket_booking',
        recordId: 'booking-1',
        displayReference: 'ABC123',
        title: 'ABC123 · Aisha Khan',
        detail: 'Ticket booking at this POS branch',
        status: 'issued · paid',
        path: '/dashboard/ticketing/ledger?search=ABC123',
      },
    ])
  })

  it('maps an application catalogue item to its owning table and namespace', async () => {
    const { client, from } = sourceClient({
      british_passport_applications: [
        {
          id: 'gb-1',
          pex_number: 'PEX-7788',
          status: 'processing',
          applicants: { first_name: 'Sam', last_name: 'Taylor' },
          applications: { tracking_number: 'APP-7788' },
        },
      ],
    })

    const options = await loadPosSourceOptions(client, {
      sourceType: 'APPLICATIONS',
      query: 'PEX',
      catalogueKey: 'gb-passport',
      locationId: 'branch-1',
    })

    expect(from).toHaveBeenCalledWith('british_passport_applications')
    expect(options[0]).toMatchObject({
      sourceType: 'APPLICATIONS',
      namespace: 'gb_passport',
      recordId: 'gb-1',
      displayReference: 'PEX-7788',
      title: 'PEX-7788 · Sam Taylor',
    })
  })

  it('keeps LMS lookup company-wide and links the selected loan, not the customer row', async () => {
    const { client, calls } = sourceClient({
      loan_customers: [
        {
          id: 'customer-1',
          first_name: 'Jamie',
          last_name: 'Ali',
          phone_number: '07000000000',
          loans: [{ id: 'loan-12345678', status: 'active' }],
        },
      ],
    })

    const options = await loadPosSourceOptions(client, {
      sourceType: 'LMS',
      query: 'Jamie',
      catalogueKey: 'lms-payment',
      locationId: 'branch-1',
    })

    expect(calls.some((call) => call.operation === 'eq' && call.args[0] === 'location_id')).toBe(
      false,
    )
    expect(options[0]).toMatchObject({
      sourceType: 'LMS',
      namespace: 'loan',
      recordId: 'loan-12345678',
      title: 'Jamie Ali',
      path: '/dashboard/lms/statement/customer-1',
    })
  })
})
