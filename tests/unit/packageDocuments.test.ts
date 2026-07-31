import { describe, expect, it } from 'vitest'
import type { TravelPackageDocument } from '@/app/types/packages'
import {
  buildPackageDocumentStorageKey,
  createPackageDocumentAccessToken,
  getPackageDocumentCategoryLabel,
  groupPackageDocumentsByCategory,
  isAgentOnlyPackageDocumentCategory,
  normalizePackageDocumentCategory,
  sanitizePackageDocumentFileName,
} from '@/lib/packageDocuments'

describe('package document helpers', () => {
  it('creates compact access tokens for customer document portals', () => {
    expect(createPackageDocumentAccessToken()).toMatch(/^[a-f0-9]{28}$/)
  })

  it('normalizes document categories and labels', () => {
    expect(normalizePackageDocumentCategory('flight')).toBe('flight')
    expect(normalizePackageDocumentCategory('travel_documents')).toBe('travel_documents')
    expect(normalizePackageDocumentCategory('unknown')).toBe('other')
    expect(getPackageDocumentCategoryLabel('e_sim')).toBe('E-Sim')
    expect(getPackageDocumentCategoryLabel('travel_documents')).toBe('Travel Documents')
    expect(isAgentOnlyPackageDocumentCategory('travel_documents')).toBe(true)
    expect(isAgentOnlyPackageDocumentCategory('flight')).toBe(false)
  })

  it('sanitizes storage file names and builds package-scoped keys', () => {
    expect(sanitizePackageDocumentFileName('Hotel/Voucher "Final".pdf')).toBe(
      'Hotel-Voucher -Final-.pdf',
    )

    const key = buildPackageDocumentStorageKey({
      packagePrefix: '/PT-ABC123/',
      category: 'hotel',
      fileName: 'Hotel/Voucher "Final".pdf',
    })

    expect(key).toMatch(/^PT-ABC123\/documents\/hotel\/[a-f0-9]{12}-Hotel-Voucher -Final-\.pdf$/)
  })

  it('groups documents by the supported customer categories', () => {
    const documents = [
      { id: 'doc-1', category: 'visa', title: 'Visa' },
      { id: 'doc-2', category: 'flight', title: 'Ticket' },
    ] as TravelPackageDocument[]

    const groups = groupPackageDocumentsByCategory(documents)

    expect(groups.map((group) => group.value)).toEqual(['flight', 'visa'])
    expect(groups[0].documents[0].title).toBe('Ticket')
  })
})
