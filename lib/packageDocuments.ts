import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
} from '@/app/types/packages'

export const PACKAGE_DOCUMENT_CATEGORIES: Array<{
  value: TravelPackageDocumentCategory
  label: string
}> = [
  { value: 'flight', label: 'Flights' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'transport', label: 'Transport' },
  { value: 'visa', label: 'Visa' },
  { value: 'e_sim', label: 'E-Sim' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
]

export const PACKAGE_DOCUMENT_CATEGORY_VALUES = new Set(
  PACKAGE_DOCUMENT_CATEGORIES.map((category) => category.value),
)

export function createPackageDocumentAccessToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 28)
}

export function normalizePackageDocumentCategory(value: unknown): TravelPackageDocumentCategory {
  return PACKAGE_DOCUMENT_CATEGORY_VALUES.has(value as TravelPackageDocumentCategory)
    ? (value as TravelPackageDocumentCategory)
    : 'other'
}

export function getPackageDocumentCategoryLabel(category: TravelPackageDocumentCategory) {
  return PACKAGE_DOCUMENT_CATEGORIES.find((item) => item.value === category)?.label || 'Other'
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
