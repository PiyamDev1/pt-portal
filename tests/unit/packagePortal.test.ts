import { describe, expect, it } from 'vitest'
import type { TravelPackageDocument } from '@/app/types/packages'
import {
  createPublicPackageDocument,
  createPublicTransportVoucher,
  normalizePackagePortalReference,
} from '@/lib/packagePortal'

describe('package portal public data boundary', () => {
  it('normalizes references without allowing query wildcard characters', () => {
    expect(normalizePackagePortalReference(' pt-ab%_12 ')).toBe('PT-AB12')
  })

  it('does not expose document storage or internal metadata', () => {
    const document = {
      id: 'document-1',
      package_id: 'package-1',
      category: 'flight',
      title: 'Flight confirmation',
      file_name: 'flight.pdf',
      file_size: 1200,
      file_type: 'application/pdf',
      status: 'released',
      customer_visible: true,
      released_at: '2026-07-12T00:00:00.000Z',
      public_notes: 'Your confirmed flight',
      created_at: '2026-07-12T00:00:00.000Z',
      storage_bucket: 'private-bucket',
      storage_key: 'packages/private/file.pdf',
      internal_notes: 'Supplier cost notes',
      metadata: { private: true },
    } as TravelPackageDocument

    const result = createPublicPackageDocument(document, 'https://signed.example/file')

    expect(result).toMatchObject({
      title: 'Flight confirmation',
      signed_url: 'https://signed.example/file',
    })
    expect(result).not.toHaveProperty('storage_bucket')
    expect(result).not.toHaveProperty('storage_key')
    expect(result).not.toHaveProperty('internal_notes')
    expect(result).not.toHaveProperty('metadata')
  })

  it('removes internal voucher notes from the public response', () => {
    const result = createPublicTransportVoucher({
      id: 'voucher-1',
      voucher_data: {
        routes: ['Jeddah to Makkah'],
        publicNotes: 'Meet at arrivals',
        internalNotes: 'Supplier owes commission',
      },
    })

    expect(result?.voucher_data).toEqual({
      routes: ['Jeddah to Makkah'],
      publicNotes: 'Meet at arrivals',
    })
  })
})
