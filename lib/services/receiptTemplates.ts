/**
 * Module: lib/services/receiptTemplates.ts
 * Receipt rendering helpers for copyable text output.
 */

import {
  RECEIPT_DEFAULT_CURRENCY,
  RECEIPT_SERVICE_LABELS,
  RECEIPT_TYPE_LABELS,
} from '@/lib/constants/receiptConfig'
import type { GeneratedReceipt } from './receiptGenerator'

function formatCurrency(amount: number | null | undefined, currency = RECEIPT_DEFAULT_CURRENCY) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return 'N/A'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

export function buildReceiptPlainText(receipt: GeneratedReceipt) {
  const serviceLabel = RECEIPT_SERVICE_LABELS[receipt.serviceType]
  const typeLabel = RECEIPT_TYPE_LABELS[receipt.receiptType]
  const lines = [
    '------------------------------',
    `${receipt.companyName} - Receipt`,
    '------------------------------',
    `Service: ${serviceLabel}`,
    `Receipt Type: ${typeLabel}`,
    `Tracking Number: ${receipt.trackingNumber || 'N/A'}`,
    `Applicant: ${receipt.applicantName || 'N/A'}`,
    `Phone: ${receipt.phone || 'N/A'}`,
    `PIN: ${receipt.receiptPin}`,
    `Generated At: ${new Date(receipt.generatedAt).toLocaleString('en-GB')}`,
    '',
    'Pricing',
    `- Description: ${receipt.pricing.serviceDescription || 'N/A'}`,
    `- Cost Price: ${formatCurrency(receipt.pricing.costPrice, receipt.pricing.currency)}`,
    `- Sale Price: ${formatCurrency(receipt.pricing.salePrice, receipt.pricing.currency)}`,
    `- Currency: ${receipt.pricing.currency || RECEIPT_DEFAULT_CURRENCY}`,
    '',
    `Verification: ${receipt.verificationUrl || 'N/A'}`,
    '------------------------------',
  ]

  return lines.join('\n')
}
