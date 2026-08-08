import type { SupabaseClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import type { TravelPackageFolder, TravelPackageTransportVoucherData } from '@/app/types/packages'
import { createPackageDocumentAccessToken } from '@/lib/packageDocuments'
import { getPackageDocumentPortalUrl } from '@/lib/packageTransportVoucher'

function defaultAccessExpiry() {
  const expiry = new Date()
  expiry.setUTCMonth(expiry.getUTCMonth() + 10)
  return expiry.toISOString()
}

function isFutureDate(value?: string | null) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

function lastNameFromCustomer(customerName?: string | null) {
  return String(customerName || '')
    .trim()
    .split(/\s+/)
    .at(-1)
    ?.toLowerCase()
}

export async function ensureTransportVoucherPortalAccess(
  supabase: SupabaseClient,
  packageFolder: Pick<
    TravelPackageFolder,
    | 'id'
    | 'customer_name'
    | 'customer_access_last_name'
    | 'document_access_token'
    | 'document_access_enabled'
    | 'document_access_expires_at'
  >,
) {
  const token = packageFolder.document_access_token || createPackageDocumentAccessToken()
  const expiresAt = isFutureDate(packageFolder.document_access_expires_at)
    ? packageFolder.document_access_expires_at
    : defaultAccessExpiry()
  const shouldUpdate =
    !packageFolder.document_access_token ||
    !packageFolder.document_access_enabled ||
    packageFolder.document_access_expires_at !== expiresAt ||
    !packageFolder.customer_access_last_name

  if (shouldUpdate) {
    await supabase
      .from('travel_packages')
      .update({
        document_access_enabled: true,
        document_access_token: token,
        document_access_expires_at: expiresAt,
        document_release_status: 'released',
        customer_access_last_name:
          packageFolder.customer_access_last_name ||
          lastNameFromCustomer(packageFolder.customer_name),
        portal_access_created_at: new Date().toISOString(),
      })
      .eq('id', packageFolder.id)
  }

  return {
    token,
    url: getPackageDocumentPortalUrl(token),
    expiresAt,
  }
}

export async function enrichTransportVoucherPortalData(
  supabase: SupabaseClient,
  packageFolder: Parameters<typeof ensureTransportVoucherPortalAccess>[1],
  voucherData: TravelPackageTransportVoucherData,
) {
  const portalAccess = await ensureTransportVoucherPortalAccess(supabase, packageFolder)
  const digitalVoucherUrl = voucherData.digitalVoucherUrl || portalAccess.url
  let qrCodeDataUrl = voucherData.qrCodeDataUrl || ''

  if (!qrCodeDataUrl) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(digitalVoucherUrl, {
        width: 180,
        margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      })
    } catch {
      qrCodeDataUrl = ''
    }
  }

  return {
    ...voucherData,
    digitalVoucherUrl,
    qrCodeDataUrl,
  }
}
