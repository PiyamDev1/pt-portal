/**
 * POST /api/receipts/generate
 * Generates a receipt payload for an application lifecycle event.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import {
  generateReceipt,
  type ReceiptServiceType,
  type ReceiptType,
} from '@/lib/services/receiptGenerator'

type RequestBody = {
  serviceType?: ReceiptServiceType
  serviceRecordId?: string
  receiptType?: ReceiptType
  generatedBy?: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const { serviceType, serviceRecordId, receiptType, generatedBy } = body

    if (!serviceType || !serviceRecordId || !receiptType) {
      return apiError('Missing serviceType, serviceRecordId, or receiptType', 400)
    }

    const receipt = await generateReceipt({
      serviceType,
      serviceRecordId,
      receiptType,
      generatedBy: generatedBy || null,
    })

    return apiOk({ receipt })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to generate receipt'), 500)
  }
}
