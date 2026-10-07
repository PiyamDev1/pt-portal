import { describe, expect, it } from 'vitest'
import type { GeneratedReceipt } from '@/lib/services/receiptGenerator'
import { buildReceiptPlainText } from '@/lib/services/receiptTemplates'

describe('buildReceiptPlainText for Visa applications', () => {
  it('labels the output as an application copy and does not imply payment', () => {
    const receipt = {
      id: 'visa-receipt-1',
      receiptNumber: 'RC-VISA-1',
      applicationId: 'visa-1',
      applicantId: 'applicant-1',
      applicantName: 'Jane Doe',
      familyHeadName: null,
      contactNumber: null,
      serviceName: 'France Visa (Tourism)',
      processingSpeed: '90 days',
      phone: null,
      email: null,
      serviceType: 'visa',
      receiptType: 'submission',
      trackingNumber: 'VISA-001',
      applicationPin: null,
      receiptPin: '',
      pricing: {
        serviceDescription: 'France / Tourism',
        costPrice: 50,
        salePrice: 75,
        currency: 'GBP',
      },
      generatedAt: '2026-10-07T12:00:00.000Z',
      generatedBy: null,
      companyName: 'PT Portal',
      verificationUrl: null,
      qrCodeDataUrl: null,
      plainText: '',
    } as GeneratedReceipt

    const output = buildReceiptPlainText(receipt)

    expect(output).toContain('Piyam Travel Visa Application Copy')
    expect(output).toContain('Application Record Copy')
    expect(output).toContain('Visa validity: 90 days')
    expect(output).toContain('Recorded agency price:')
    expect(output).toContain('Visa application details only - not proof of payment')
    expect(output).not.toContain('Processing speed:')
  })
})
