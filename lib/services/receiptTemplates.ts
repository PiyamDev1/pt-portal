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
    'Piyam Travel Service Receipt',
    '------------------------------',
    `Service: ${receipt.serviceName || serviceLabel}`,
    `Processing speed: ${receipt.processingSpeed || 'Standard'}`,
    `Family Head Name: ${receipt.familyHeadName || 'N/A'}`,
    `Contact Number: ${receipt.contactNumber || receipt.phone || 'N/A'}`,
    `Applicant Name: ${receipt.applicantName || 'N/A'}`,
    `Tracking Number: ${receipt.trackingNumber || 'N/A'}`,
    `Pin: ${receipt.receiptPin}`,
    `Price: ${formatCurrency(receipt.pricing.salePrice, receipt.pricing.currency)}`,
    `Generated at: ${new Date(receipt.generatedAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`,
    '',
    `Service: ${serviceLabel}`,
    `Receipt Type: ${typeLabel}`,
    `Verification: ${receipt.verificationUrl || 'N/A'}`,
    '',
    'Pricing',
    `- Description: ${receipt.pricing.serviceDescription || 'N/A'}`,
    `- Cost Price: ${formatCurrency(receipt.pricing.costPrice, receipt.pricing.currency)}`,
    `- Sale Price: ${formatCurrency(receipt.pricing.salePrice, receipt.pricing.currency)}`,
    `- Currency: ${receipt.pricing.currency || RECEIPT_DEFAULT_CURRENCY}`,
    '------------------------------',
  ]

  return lines.join('\n')
}
