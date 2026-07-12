import { describe, expect, it } from 'vitest'
import {
  decodeFirestoreFields,
  normalizeLegacyBookingCustomer,
} from '@/lib/legacyBookingsMigration'

describe('legacy bookings migration mapping', () => {
  it('decodes nested Firestore REST values', () => {
    const decoded = decodeFirestoreFields({
      referenceNumber: { stringValue: 'PT-OLD123' },
      archived: { booleanValue: true },
      checklist: {
        arrayValue: { values: [{ stringValue: 'Flights' }, { stringValue: 'Hotels' }] },
      },
      keyInformation: { mapValue: { fields: { manager: { stringValue: 'Agent' } } } },
    })
    expect(decoded).toEqual({
      referenceNumber: 'PT-OLD123',
      archived: true,
      checklist: ['Flights', 'Hotels'],
      keyInformation: { manager: 'Agent' },
    })
  })

  it('accepts known legacy aliases and preserves the source payload', () => {
    const customer = normalizeLegacyBookingCustomer({
      id: 'firebase-1',
      fields: {
        reference: 'PT-OLD123',
        fullName: 'Aisha Khan',
        type: "Ziyara'at",
        files: [{ fileName: 'Ticket.pdf', type: 'Flights', key: 'old/ticket.pdf' }],
        isArchived: true,
      },
    })
    expect(customer).toMatchObject({
      id: 'firebase-1',
      referenceNumber: 'PT-OLD123',
      customerName: 'Aisha Khan',
      lastName: 'Khan',
      packageType: 'ziyarat',
      archived: true,
    })
    expect(customer.documents[0]).toMatchObject({
      name: 'Ticket.pdf',
      category: 'Flights',
      fileKey: 'old/ticket.pdf',
    })
    expect(customer.source.fullName).toBe('Aisha Khan')
  })
})
