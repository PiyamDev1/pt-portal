import type { TravelPackageDocument } from '@/app/types/packages'

export function normalizePackagePortalReference(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9-]/g, '')
    : ''
}

export function createPublicPackageDocument(document: TravelPackageDocument, signedUrl: string) {
  return {
    id: document.id,
    package_id: document.package_id,
    category: document.category,
    title: document.title,
    file_name: document.file_name,
    file_size: document.file_size,
    file_type: document.file_type,
    status: document.status,
    customer_visible: document.customer_visible,
    released_at: document.released_at,
    public_notes: document.public_notes,
    created_at: document.created_at,
    signed_url: signedUrl,
  }
}

export function createPublicTransportVoucher<T extends Record<string, unknown>>(
  voucher: T | null | undefined,
) {
  if (!voucher) return null
  const voucherData = voucher.voucher_data
  if (!voucherData || typeof voucherData !== 'object' || Array.isArray(voucherData)) {
    return { ...voucher, voucher_data: null }
  }

  const { internalNotes: _internalNotes, ...publicVoucherData } = voucherData as Record<
    string,
    unknown
  >
  return { ...voucher, voucher_data: publicVoucherData }
}
