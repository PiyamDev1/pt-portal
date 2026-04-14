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
  const isNadra = receipt.serviceType === 'nadra'
  const trackingLabel = receipt.serviceType === 'gb_passport' ? 'PEX REF' : 'Tracking Number'
  const lines = [
    '------------------------------',
    'Piyam Travel Service Receipt',
    '------------------------------',
    `Receipt Number: ${receipt.receiptNumber}`,
    `Service Type: ${serviceLabel}`,
    `Service: ${receipt.serviceName || serviceLabel}`,
    `Processing speed: ${receipt.processingSpeed || 'Standard'}`,
    `Contact Number: ${receipt.contactNumber || receipt.phone || 'N/A'}`,
    `Applicant Name: ${receipt.applicantName || 'N/A'}`,
    `${trackingLabel}: ${receipt.trackingNumber || 'N/A'}`,
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
    `Verification: ${isNadra ? receipt.verificationUrl || 'N/A' : 'Not required'}`,
    '',
    'Pricing',
    `- Description: ${receipt.pricing.serviceDescription || 'N/A'}`,
    `- Cost Price: ${formatCurrency(receipt.pricing.costPrice, receipt.pricing.currency)}`,
    `- Sale Price: ${formatCurrency(receipt.pricing.salePrice, receipt.pricing.currency)}`,
    `- Currency: ${receipt.pricing.currency || RECEIPT_DEFAULT_CURRENCY}`,
    '------------------------------',
  ]

  if (isNadra) {
    lines.splice(7, 0, `Family Head Name: ${receipt.familyHeadName || 'N/A'}`)
    lines.splice(11, 0, `Pin: ${receipt.receiptPin || 'N/A'}`)
  }

  return lines.join('\n')
}
