/**
 * POST /api/receipts/generate
 * Generates a receipt payload for an application lifecycle event.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { generateReceipt } from '@/lib/services/receiptGenerator'

const generateReceiptSchema = z
  .object({
    serviceType: z.enum(['nadra', 'pk_passport', 'gb_passport']),
    serviceRecordId: z.string().trim().min(1).max(200),
    receiptType: z.enum(['submission', 'biometrics', 'refund', 'collection']),
  })
  .strip()

export async function POST(request: Request) {
  try {
    const access = await requireStaffSession()
    if (!access.authorized) return access.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      generateReceiptSchema,
      { maxBytes: 8 * 1024 },
    )
    if (bodyError || !body) {
      const tooLarge = bodyError === 'Request body is too large'
      return apiError(
        tooLarge
          ? bodyError
          : `Missing or invalid receipt fields: ${bodyError || 'invalid request'}`,
        tooLarge ? 413 : 400,
      )
    }
    const { serviceType, serviceRecordId, receiptType } = body

    const receipt = await generateReceipt({
      serviceType,
      serviceRecordId,
      receiptType,
      generatedBy: access.employee.id,
    })

    return apiOk({ receipt })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to generate receipt'), 500)
  }
}
