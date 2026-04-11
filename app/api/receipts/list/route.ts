/**
 * GET /api/receipts/list
 * Lists generated receipts by applicant and optional service type.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { listPersistedReceipts } from '@/lib/services/receiptStore'
import type { ReceiptServiceType } from '@/lib/services/receiptGenerator'

const ALLOWED_SERVICE_TYPES: ReceiptServiceType[] = ['nadra', 'pk_passport', 'gb_passport']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const applicantId = String(searchParams.get('applicantId') || '').trim()
  const serviceTypeRaw = String(searchParams.get('serviceType') || '').trim()
  const includePayload = String(searchParams.get('includePayload') || '').trim().toLowerCase() === 'true'

  if (!applicantId && !serviceTypeRaw) {
    return apiError('Provide applicantId or serviceType', 400)
  }

  let serviceType: ReceiptServiceType | undefined
  if (serviceTypeRaw) {
    if (!ALLOWED_SERVICE_TYPES.includes(serviceTypeRaw as ReceiptServiceType)) {
      return apiError('Invalid serviceType', 400)
    }
    serviceType = serviceTypeRaw as ReceiptServiceType
  }

  const result = await listPersistedReceipts({
    applicantId: applicantId || undefined,
    serviceType,
    includePayload,
  })

  return apiOk({
    supported: result.supported,
    message: result.supported ? undefined : result.reason,
    receipts: result.receipts,
  })
}
