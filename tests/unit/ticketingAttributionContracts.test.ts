import { describe, expect, it } from 'vitest'
import { ticketingCorrectAttributionSchema } from '@/lib/ticketing/attributionContracts'
import { normalizeTicketingCustomerName, ticketingQuickTkSchema } from '@/lib/ticketing/contracts'

const PRIMARY_ID = '40000000-0000-4000-8000-000000000001'
const ASSISTANT_ID = '40000000-0000-4000-8000-000000000002'

describe('ticketing attribution contracts', () => {
  it.each([
    ['SMITH / JOHN', 'John Smith'],
    ['  SMITH  /  JOHN  ', 'John Smith'],
    ['JOHN SMITH', 'John Smith'],
    ["O'NEIL / ANNE-MARIE", "Anne-Marie O'Neil"],
    ['John SMITH', 'John SMITH'],
    ['SMITH / JOHN / MR', 'Smith / John / Mr'],
  ])('normalizes customer names from GDS and NDC formats', (input, expected) => {
    expect(normalizeTicketingCustomerName(input)).toBe(expected)
  })

  it('accepts a strict, reasoned correction', () => {
    expect(
      ticketingCorrectAttributionSchema.parse({
        expectedBookingVersion: 4,
        responsibleEmployeeId: PRIMARY_ID,
        assistantEmployeeIds: [ASSISTANT_ID],
        reason: '  Corrected after an administrator covered the ticket  ',
      }),
    ).toEqual({
      expectedBookingVersion: 4,
      responsibleEmployeeId: PRIMARY_ID,
      assistantEmployeeIds: [ASSISTANT_ID],
      reason: 'Corrected after an administrator covered the ticket',
    })
  })

  it.each([
    {
      name: 'duplicate assistants',
      patch: { assistantEmployeeIds: [ASSISTANT_ID, ASSISTANT_ID] },
    },
    {
      name: 'the primary repeated as an assistant',
      patch: { assistantEmployeeIds: [PRIMARY_ID] },
    },
    {
      name: 'more than ten assistants',
      patch: {
        assistantEmployeeIds: Array.from(
          { length: 11 },
          (_, index) => `40000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
        ),
      },
    },
    { name: 'a blank reason', patch: { reason: '  ' } },
    { name: 'an unknown identity field', patch: { actingEmployeeId: PRIMARY_ID } },
  ])('rejects $name', ({ patch }) => {
    expect(
      ticketingCorrectAttributionSchema.safeParse({
        expectedBookingVersion: 4,
        responsibleEmployeeId: PRIMARY_ID,
        assistantEmployeeIds: [ASSISTANT_ID],
        reason: 'Correction reason',
        ...patch,
      }).success,
    ).toBe(false)
  })

  it('applies empty attribution defaults to ordinary quick entry', () => {
    const parsed = ticketingQuickTkSchema.parse({
      customerName: 'Test Passenger',
      pnr: 'ABC123',
      airlineId: '50000000-0000-4000-8000-000000000001',
      serviceType: 'TK',
      operationalStatus: 'held',
      bookingDate: '2026-08-24',
      timeLimitAt: '2026-08-25T17:00',
      issuedAt: null,
      currency: 'GBP',
      fares: [
        {
          passengerType: 'ADT',
          quantity: 1,
          unitSupplierCost: 400,
          unitSalePrice: 500,
          unitDiscount: 0,
        },
      ],
    })

    expect(parsed).toMatchObject({
      customerName: 'Test Passenger',
      assistantEmployeeIds: [],
      attributionReason: null,
    })
    expect(parsed).not.toHaveProperty('responsibleEmployeeId')
  })

  it('rejects duplicate assistants and primary/assistant overlap on quick entry', () => {
    const base = {
      customerName: 'Test Passenger',
      pnr: 'ABC123',
      airlineId: '50000000-0000-4000-8000-000000000001',
      serviceType: 'TK' as const,
      operationalStatus: 'issued' as const,
      bookingDate: '2026-08-24',
      timeLimitAt: null,
      issuedAt: '2026-08-24',
      currency: 'GBP' as const,
      fares: [
        {
          passengerType: 'ADT' as const,
          quantity: 1,
          unitSupplierCost: 400,
          unitSalePrice: 500,
          unitDiscount: 0,
        },
      ],
      responsibleEmployeeId: PRIMARY_ID,
    }

    expect(
      ticketingQuickTkSchema.safeParse({
        ...base,
        assistantEmployeeIds: [ASSISTANT_ID, ASSISTANT_ID],
      }).success,
    ).toBe(false)
    expect(
      ticketingQuickTkSchema.safeParse({ ...base, assistantEmployeeIds: [PRIMARY_ID] }).success,
    ).toBe(false)
  })

  it('keeps ticket discount within the entered sale price', () => {
    const parsed = ticketingQuickTkSchema.safeParse({
      customerName: 'Youth Passenger',
      pnr: 'YTH123',
      airlineId: '50000000-0000-4000-8000-000000000001',
      serviceType: 'TK',
      operationalStatus: 'issued',
      bookingDate: '2026-08-28',
      timeLimitAt: null,
      issuedAt: '2026-08-28',
      currency: 'GBP',
      fares: [
        {
          passengerType: 'YTH',
          quantity: 1,
          unitSupplierCost: 200,
          unitSalePrice: 250,
          unitDiscount: 300,
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})
