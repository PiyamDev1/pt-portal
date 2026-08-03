import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
} from '@/app/types/packages'

export const PACKAGE_DOCUMENT_CATEGORIES: Array<{
  value: TravelPackageDocumentCategory
  label: string
  agentOnly?: boolean
}> = [
  { value: 'flight', label: 'Flights' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'transport', label: 'Transport' },
  { value: 'visa', label: 'Visa' },
  { value: 'e_sim', label: 'E-Sim' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'travel_documents', label: 'Travel Documents', agentOnly: true },
  { value: 'other', label: 'Other' },
]

export const PACKAGE_DOCUMENT_CATEGORY_VALUES = new Set(
  PACKAGE_DOCUMENT_CATEGORIES.map((category) => category.value),
)

export const THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES: TravelPackageDocumentCategory[] = [
  'flight',
  'transport',
  'visa',
  'hotel',
  'travel_documents',
]

export const THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORY_VALUES = new Set(
  THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES,
)

export function createPackageDocumentAccessToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 28)
}

export function createPackageThirdPartyAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function normalizePackageDocumentCategory(value: unknown): TravelPackageDocumentCategory {
  return PACKAGE_DOCUMENT_CATEGORY_VALUES.has(value as TravelPackageDocumentCategory)
    ? (value as TravelPackageDocumentCategory)
    : 'other'
}

export function normalizeThirdPartyPackageDocumentCategories(value: unknown) {
  const values = Array.isArray(value) ? value : []
  const categories = values.filter((item): item is TravelPackageDocumentCategory =>
    THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORY_VALUES.has(item as TravelPackageDocumentCategory),
  )
  return categories.length > 0 ? [...new Set(categories)] : THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES
}

export function getPackageDocumentCategoryLabel(category: TravelPackageDocumentCategory) {
  return PACKAGE_DOCUMENT_CATEGORIES.find((item) => item.value === category)?.label || 'Other'
}

export function isAgentOnlyPackageDocumentCategory(category: TravelPackageDocumentCategory) {
  return Boolean(PACKAGE_DOCUMENT_CATEGORIES.find((item) => item.value === category)?.agentOnly)
}

export function sanitizePackageDocumentFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 140)

  return cleaned || 'document'
}

export function buildPackageDocumentStorageKey({
  packagePrefix,
  category,
  fileName,
}: {
  packagePrefix: string
  category: TravelPackageDocumentCategory
  fileName: string
}) {
  const cleanPrefix = packagePrefix.trim().replace(/^\/+/, '').replace(/\/?$/, '/')
  const safeFileName = sanitizePackageDocumentFileName(fileName)
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${cleanPrefix}documents/${category}/${token}-${safeFileName}`
}

export function groupPackageDocumentsByCategory(documents: TravelPackageDocument[]) {
  return PACKAGE_DOCUMENT_CATEGORIES.map((category) => ({
    ...category,
    documents: documents.filter((document) => document.category === category.value),
  })).filter((group) => group.documents.length > 0)
}
